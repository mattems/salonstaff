/**
 * The admin portal's queues: right-to-work and qualification checks waiting for staff, and
 * claims on directory listings. Deciding them goes through `checks(db)` and `claims(db)`, which
 * keep the rules (D-03, D-04); these routes add the staff gate, the files and the notices.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { type BackOffice, checks, claims } from "@salonstaff/db";
import { ApiError, encodeId, salonPath } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { appUrl, notify, tellOwnersAboutClaim } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { decodeCursor, PaginationQuery } from "../lib/pagination";
import { requireStaff } from "../lib/staff-context";
import {
  admin,
  body,
  errors,
  IdParams,
  iso,
  missing,
  notFound,
  ok,
  Page,
  page,
  pathId,
  Reason,
  realEmail,
} from "./admin";
import { deleteFiles } from "./admin-users";

const CHECKS = "/admin/v1/checks";
const CLAIMS = "/admin/v1/claims";
const Note = z.string().trim().max(500);

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const Check = z
  .object({
    id: z.string().openapi({ example: "chk_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    kind: z.enum(["right_to_work", "qualification"]),
    status: z.string(),
    person: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    details: z.record(z.string(), z.unknown()).openapi({
      description:
        "What they sent: the basis, visa grant number and passport country for right to work (until decided), or the qualification's title. Once decided only a minimal result is left.",
    }),
    document_url: z.string().nullable().openapi({
      description: "The certificate, from the private bucket, while it waits for a decision.",
    }),
    reference: z.string().nullable(),
    review_note: z.string().nullable(),
    submitted_at: z.string(),
    decided_at: z.string().nullable(),
  })
  .openapi("AdminCheck");

type CheckRow = Awaited<ReturnType<BackOffice["checks"]["list"]>>[number];

function checkJson(row: CheckRow) {
  const { check, user } = row;
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || user.name;
  const id = encodeId("check", check.id);
  return {
    id,
    kind: check.kind as "right_to_work" | "qualification",
    status: check.status,
    person: {
      id: encodeId("user", user.id),
      name,
      email: realEmail(user.email),
      phone: user.phoneNumber,
    },
    details: check.result,
    document_url: check.documentKey ? `${CHECKS}/${id}/document` : null,
    reference: check.reference,
    review_note: check.reviewNote,
    submitted_at: check.createdAt.toISOString(),
    decided_at: iso(check.decidedAt),
  };
}

admin.openapi(
  createRoute({
    method: "get",
    path: CHECKS,
    summary: "Checks for staff to decide",
    description:
      "Right-to-work and qualification checks. `pending` (the default): waiting for a decision, oldest first. `all`: every one, newest first. Identity checks are decided by Stripe Identity and aren't here.",
    tags: ["Admin"],
    request: {
      query: PaginationQuery.extend({ status: z.enum(["pending", "all"]).default("pending") }),
    },
    responses: { 200: ok(Page(Check), "A page of checks"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "checks:review");
    const { limit, cursor, status } = c.req.valid("query");
    const rows = await data.checks.list({ limit: limit + 1, before: decodeCursor(cursor), status });
    return c.json(
      page(rows, limit, (row) => row.check.id, checkJson),
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "get",
    path: `${CHECKS}/{id}/document`,
    summary: "A check's certificate",
    description:
      "From the private bucket, never cached. Only while the check waits for a decision: deciding deletes it.",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: {
      200: {
        description: "The file",
        content: {
          "application/pdf": { schema: z.string().openapi({ type: "string", format: "binary" }) },
          "image/jpeg": { schema: z.string().openapi({ type: "string", format: "binary" }) },
          "image/png": { schema: z.string().openapi({ type: "string", format: "binary" }) },
        },
      },
      ...errors,
      404: problemResponse("No such check, or it has no document (any more)"),
    },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "checks:review");
    const check = await data.checks.find(pathId(c, "check", CHECKS));
    const object = check?.documentKey ? await c.env.PRIVATE.get(check.documentKey) : null;
    if (!object) {
      throw new ApiError("not_found", {
        detail: "This check has no document",
        hint: "Documents are deleted once a check is decided. Check `document_url` on the check first.",
      });
    }
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);

const KIND_NAMES = { right_to_work: "right to work", qualification: "qualification" } as const;

admin.openapi(
  createRoute({
    method: "post",
    path: `${CHECKS}/{id}/decision`,
    summary: "Decide a check",
    description:
      "`verified` gives it a verification ID; `failed` needs a note saying why (the person is told). Either way the evidence is deleted: the certificate from the private bucket, and visa details from the record (D-03).",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(z.object({ decision: z.enum(["verified", "failed"]), note: Note.optional() })),
    },
    responses: {
      200: ok(Check, "The check, decided"),
      ...errors,
      ...notFound,
      409: problemResponse("It has already been decided"),
    },
  }),
  async (c) => {
    const { data, staff, actor } = await requireStaff(c, "checks:review");
    const id = pathId(c, "check", CHECKS);
    const [row] = await data.checks.list({ limit: 1, status: "all", id });
    if (!row) missing("check", CHECKS);
    const { decision, note } = c.req.valid("json");
    if (decision === "failed" && (note ?? "").length < 3) {
      throw new ApiError("validation_failed", {
        detail: "Say why it failed: the person is told",
        hint: "Send `note`, at least 3 characters.",
        errors: [{ path: "note", message: "Required when the check fails" }],
      });
    }
    if (row.check.status !== "pending" && row.check.status !== "requires_input") {
      throw new ApiError("conflict", {
        detail: "This check has already been decided",
        hint: "Reload the queue: someone else may have decided it.",
      });
    }
    if (c.get("dryRun")) {
      return c.json(
        checkJson({ ...row, check: { ...row.check, status: decision, documentKey: null } }),
        200,
      );
    }
    const { evidenceKeys } = await checks(await c.get("db")()).review(
      id,
      decision,
      staff.id,
      note,
      {
        ip: actor.ip,
        requestId: actor.requestId,
      },
    );
    await deleteFiles(c, { media: [], private: evidenceKeys });
    const [after] = await data.checks.list({ limit: 1, status: "all", id });
    const kind = KIND_NAMES[row.check.kind as keyof typeof KIND_NAMES] ?? "check";
    notify(
      c,
      await checks(await c.get("db")()).contactOf(row.user.id),
      decision === "verified"
        ? {
            topic: "account",
            subject: `Your ${kind} is verified`,
            title: `Your ${kind} is verified`,
            body: "Salons will see it on your profile when you apply.",
            action: "See your checks",
            url: appUrl(c, "/account/verify"),
          }
        : {
            topic: "account",
            subject: `We couldn't verify your ${kind}`,
            title: `We couldn't verify your ${kind}`,
            body: `${note ?? ""} You can send it again from your account.`.trim(),
            action: "Try again",
            url: appUrl(c, "/account/verify"),
          },
    );
    return c.json(checkJson(after ?? row), 200);
  },
);

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

const Claim = z
  .object({
    id: z.string().openapi({ example: "clm_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    status: z.enum(["pending_email", "pending_review", "approved", "rejected"]),
    method: z.enum(["email", "review"]).openapi({
      description:
        "`email`: proven by the link sent to the listing's email. `review`: staff decide.",
    }),
    salon: z.object({
      id: z.string(),
      name: z.string(),
      suburb: z.string(),
      state: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      path: z.string(),
      has_owner: z.boolean(),
    }),
    claimant: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    contact_name: z.string(),
    contact_phone: z.string(),
    abn_given: z.string(),
    listing_abn: z.string().nullable(),
    abn_matches: z.boolean().nullable().openapi({
      description: "Whether the ABN given is the listing's. Null when the listing had none.",
    }),
    abr_name: z
      .string()
      .nullable()
      .openapi({ description: "The registered name the ABR gave for the ABN, if looked up." }),
    decided_by: z.string().nullable(),
    decision_note: z.string().nullable(),
    decided_at: z.string().nullable(),
    created_at: z.string(),
  })
  .openapi("AdminClaim");

type ClaimRow = Awaited<ReturnType<BackOffice["claims"]["list"]>>[number];

function claimJson(row: ClaimRow) {
  const { claim, salon, claimant } = row;
  return {
    id: encodeId("claim", claim.id),
    status: claim.status,
    method:
      claim.status === "pending_email" || claim.decidedBy === "email-link"
        ? ("email" as const)
        : ("review" as const),
    salon: {
      id: encodeId("salon", salon.id),
      name: salon.name,
      suburb: salon.suburb,
      state: salon.state,
      email: salon.email,
      phone: salon.phone,
      path: salonPath(salon),
      has_owner: salon.hasOwner,
    },
    claimant: {
      id: encodeId("user", claimant.id),
      name: claimant.name,
      email: realEmail(claimant.email),
      phone: claimant.phoneNumber,
    },
    contact_name: claim.contactName,
    contact_phone: claim.phone,
    abn_given: claim.abn,
    listing_abn: salon.abn,
    abn_matches: salon.abn ? salon.abn === claim.abn : null,
    abr_name: claim.abnEntityName,
    decided_by: claim.decidedBy,
    decision_note: claim.decisionNote,
    decided_at: iso(claim.decidedAt),
    created_at: claim.createdAt.toISOString(),
  };
}

admin.openapi(
  createRoute({
    method: "get",
    path: CLAIMS,
    summary: "Claims on directory listings",
    description:
      "`open` (the default): waiting for staff, or for the claimant to click the link emailed to the listing. `all`: every claim. Newest first.",
    tags: ["Admin"],
    request: { query: PaginationQuery.extend({ status: z.enum(["open", "all"]).default("open") }) },
    responses: { 200: ok(Page(Claim), "A page of claims"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "claims:review");
    const { limit, cursor, status } = c.req.valid("query");
    const rows = await data.claims.list({ limit: limit + 1, before: decodeCursor(cursor), status });
    return c.json(
      page(rows, limit, (row) => row.claim.id, claimJson),
      200,
    );
  },
);

async function findClaim(c: Context<AppEnv>, data: BackOffice): Promise<ClaimRow> {
  const [row] = await data.claims.list({ limit: 1, status: "all", id: pathId(c, "claim", CLAIMS) });
  return row ?? missing("claim", CLAIMS);
}

admin.openapi(
  createRoute({
    method: "post",
    path: `${CLAIMS}/{id}/approve`,
    summary: "Approve a claim",
    description:
      "The claimant becomes an owner of the listing. On an unclaimed listing it gets the launch free period (and founding pricing while places last) and other open claims on it are rejected; on a listing that already has owners, they're emailed (D-11). An ABN is public, so confirm the person first: call the salon on its listed number, or check the ABR, its website or Instagram. `note` says how.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ note: Note.optional() })) },
    responses: {
      200: ok(Claim, "The claim, approved"),
      ...errors,
      ...notFound,
      409: problemResponse("Already decided"),
    },
  }),
  async (c) => {
    const { data, staff, actor } = await requireStaff(c, "claims:review");
    const row = await findClaim(c, data);
    const { note } = c.req.valid("json");
    if (c.get("dryRun"))
      return c.json(claimJson({ ...row, claim: { ...row.claim, status: "approved" } }), 200);
    const decided = await claims(await c.get("db")()).approve(row.claim.id, staff.id, note, actor);
    notify(c, decided.contact, {
      subject: `You now manage ${decided.salon.name} on Salon Staff`,
      title: `Your claim for ${decided.salon.name} was approved`,
      body: "You can now update the listing and post jobs.",
      action: "Open your salon",
      url: appUrl(c, `/employer/${encodeId("salon", decided.salon.id)}`),
    });
    tellOwnersAboutClaim(c, decided.otherOwners, decided.salon, decided.claim.contactName);
    return c.json(claimJson((await findClaim(c, data)) ?? row), 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${CLAIMS}/{id}/reject`,
    summary: "Reject a claim",
    description: "`note` says why: the claimant is told.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ note: Reason })) },
    responses: {
      200: ok(Claim, "The claim, rejected"),
      ...errors,
      ...notFound,
      409: problemResponse("Already decided"),
    },
  }),
  async (c) => {
    const { data, staff, actor } = await requireStaff(c, "claims:review");
    const row = await findClaim(c, data);
    const { note } = c.req.valid("json");
    if (c.get("dryRun"))
      return c.json(claimJson({ ...row, claim: { ...row.claim, status: "rejected" } }), 200);
    const decided = await claims(await c.get("db")()).reject(row.claim.id, staff.id, note, actor);
    notify(c, decided.contact, {
      subject: `Your claim for ${row.salon.name} wasn't approved`,
      title: `Your claim for ${row.salon.name} wasn't approved`,
      body: note,
      action: "See the listing",
      url: appUrl(c, salonPath(row.salon)),
    });
    return c.json(claimJson(await findClaim(c, data)), 200);
  },
);
