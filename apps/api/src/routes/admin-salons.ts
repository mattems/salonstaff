/**
 * Salons and the directory in the admin portal: search, a salon's page, suspending, removing and
 * deleting, the ABN, the free period, listing credits, founding pricing, detaching the owner,
 * and adding directory listings one at a time or from a CSV.
 */
import { createRoute, z } from "@hono/zod-openapi";
import {
  type AdminJob,
  type AdminPayment,
  type AdminSalon,
  type BackOffice,
  cleanListing,
  DIRECTORY_CSV_COLUMNS,
  DIRECTORY_IMPORT_MAX_ROWS,
  DirectoryImportError,
  DuplicateListingError,
} from "@salonstaff/db";
import {
  ApiError,
  AU_STATE_VALUES,
  encodeId,
  entitlementOf,
  isSubscribed,
  jobPath,
  salonPath,
  VERIFICATION_STATUSES,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { problemResponse } from "../lib/openapi";
import { decodeCursor, PaginationQuery } from "../lib/pagination";
import { Confirmation, requireConfirmation } from "../lib/staff-confirmation";
import { requireStaff } from "../lib/staff-context";
import { mediaUrl } from "../lib/storage";
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

const LIST = "/admin/v1/salons";
const STATUSES = ["active", "suspended", "removed"] as const;

const Salon = z
  .object({
    id: z.string().openapi({ example: "sln_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    suburb: z.string(),
    state: z.string(),
    postcode: z.string(),
    path: z.string().openapi({ description: "Its public page on the website." }),
    owner: z.object({ id: z.string(), name: z.string(), email: z.string().nullable() }).nullable(),
    abn: z.string().nullable(),
    abn_status: z.enum(VERIFICATION_STATUSES),
    status: z.enum(STATUSES),
    status_reason: z.string().nullable(),
    source: z.enum(["owner", "directory"]),
    claimed_at: z.string().nullable(),
    live_jobs: z.number().int(),
    created_at: z.string(),
  })
  .openapi("AdminSalon");

export const Payment = z
  .object({
    id: z.string(),
    salon: z.object({ id: z.string(), name: z.string() }),
    kind: z.enum(["single_listing", "salon_plan", "founding_plan"]),
    amount_cents: z.number().int(),
    provider: z.string(),
    status: z.enum(["pending", "paid", "failed"]),
    created_at: z.string(),
  })
  .openapi("AdminPayment");

export const paymentJson = (payment: AdminPayment, salon: { id: string; name: string }) => ({
  id: encodeId("payment", payment.id),
  salon: { id: encodeId("salon", salon.id), name: salon.name },
  kind: payment.kind,
  amount_cents: payment.amountCents,
  provider: payment.provider,
  status: payment.status,
  created_at: payment.createdAt.toISOString(),
});

/** Draft, live, expired (published but past its date) or closed. */
export function jobState(job: AdminJob): "draft" | "live" | "expired" | "closed" {
  if (job.status !== "published") return job.status;
  return job.expiresAt && job.expiresAt > new Date() ? "live" : "expired";
}

export const JOB_STATES = ["draft", "live", "expired", "closed"] as const;

const SalonJob = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(JOB_STATES),
  featured: z.boolean(),
  paid_via: z.string().nullable(),
  applicants: z.number().int(),
  published_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
  path: z.string(),
});

const SalonDetail = z
  .object({
    salon: Salon,
    contact_name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z
      .string()
      .nullable()
      .openapi({ description: "The business's own email. Claim links go here." }),
    website: z.string().nullable(),
    instagram: z.string().nullable(),
    address: z.string().nullable(),
    about: z.string().nullable(),
    logo_url: z.string().nullable(),
    abn_entity_name: z
      .string()
      .nullable()
      .openapi({ description: "The registered name the ABR gave." }),
    founding: z.boolean(),
    free_until: z.string().nullable(),
    listing_credits: z.number().int(),
    subscription: z.object({
      status: z.string().nullable(),
      current_period_end: z.string().nullable(),
      active: z.boolean(),
    }),
    entitlement: z.object({
      ok: z.boolean(),
      via: z.enum(["free_period", "subscription", "credit"]).nullable(),
      reason: z.enum(["suspended", "needs_listing"]).nullable(),
    }),
    owner: z
      .object({
        id: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        banned_at: z.string().nullable(),
      })
      .nullable(),
    jobs: z.array(SalonJob),
    payments: z.array(Payment),
    claims: z.array(
      z.object({
        id: z.string(),
        status: z.string(),
        abn: z.string(),
        contact_name: z.string(),
        claimant: z.object({ id: z.string(), name: z.string(), email: z.string().nullable() }),
        decision_note: z.string().nullable(),
        created_at: z.string(),
      }),
    ),
  })
  .openapi("AdminSalonDetail");

const ImportReport = z
  .object({
    added: z.number().int(),
    duplicates: z.number().int().openapi({
      description:
        "Rows skipped because the salon is already listed (same ABN, or same name and postcode).",
    }),
    errors: z.array(z.object({ row: z.number().int(), message: z.string() })).openapi({
      description: "Rows skipped because something in them isn't valid. Row 1 is the header.",
    }),
  })
  .openapi("AdminImportReport");

type SearchRow = Awaited<ReturnType<BackOffice["salons"]["search"]>>[number];

function salonJson(row: {
  salon: AdminSalon;
  owner: { id: string | null; name: string | null; email: string | null } | null;
  liveJobs: number;
}) {
  const { salon, owner } = row;
  return {
    id: encodeId("salon", salon.id),
    name: salon.name,
    suburb: salon.suburb,
    state: salon.state,
    postcode: salon.postcode,
    path: salonPath(salon),
    owner:
      owner?.id && salon.ownerId
        ? { id: encodeId("user", owner.id), name: owner.name ?? "", email: realEmail(owner.email) }
        : null,
    abn: salon.abn,
    abn_status: salon.abnStatus,
    status: salon.status,
    status_reason: salon.statusReason,
    source: salon.source,
    claimed_at: iso(salon.claimedAt),
    live_jobs: Number(row.liveJobs),
    created_at: salon.createdAt.toISOString(),
  };
}

async function findSalon(c: Context<AppEnv>, data: BackOffice): Promise<AdminSalon> {
  const salon = await data.salons.find(pathId(c, "salon", LIST));
  return salon ?? missing("salon", LIST);
}

/** The salon as the list shows it, after a change. */
async function salonRow(data: BackOffice, salon: AdminSalon) {
  const { owner, liveJobs } = await data.salons.summary(salon);
  return salonJson({ salon, owner, liveJobs });
}

admin.openapi(
  createRoute({
    method: "get",
    path: LIST,
    summary: "Search salons",
    description:
      "Newest first: salons that signed up and directory listings. `q` matches the name, suburb, ABN or the owner's email.",
    tags: ["Admin"],
    request: {
      query: PaginationQuery.extend({
        q: z.string().trim().max(200).optional(),
        abn_status: z.enum(VERIFICATION_STATUSES).optional(),
        claimed: z.enum(["claimed", "unclaimed"]).optional(),
        status: z.enum(STATUSES).optional(),
      }),
    },
    responses: { 200: ok(Page(Salon), "A page of salons"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "salons:read");
    const { limit, cursor, q, abn_status, claimed, status } = c.req.valid("query");
    const rows = await data.salons.search({
      limit: limit + 1,
      before: decodeCursor(cursor),
      q,
      abnStatus: abn_status,
      claimed: claimed === undefined ? undefined : claimed === "claimed",
      status,
    });
    return c.json(
      page(rows, limit, (row: SearchRow) => row.salon.id, salonJson),
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "get",
    path: `${LIST}/{id}`,
    summary: "A salon's page",
    description:
      "Its owner, contact details, ABN, what lets it publish (free period, plan or credits), its jobs with applicant counts, payments and claims.",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: { 200: ok(SalonDetail, "The salon"), ...errors, ...notFound },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "salons:read");
    const d = await data.salons.detail(pathId(c, "salon", LIST));
    if (!d) missing("salon", LIST);
    const { salon, owner } = d;
    const entitlement = entitlementOf(salon);
    const jobs = d.jobs.map(({ job, applicants }) => ({
      id: encodeId("job", job.id),
      title: job.title,
      status: jobState(job),
      featured: job.featured,
      paid_via: job.paidVia,
      applicants: Number(applicants),
      published_at: iso(job.publishedAt),
      expires_at: iso(job.expiresAt),
      created_at: job.createdAt.toISOString(),
      path: jobPath(job),
    }));
    return c.json(
      {
        salon: salonJson({
          salon,
          owner,
          liveJobs: jobs.filter((j) => j.status === "live").length,
        }),
        contact_name: salon.contactName,
        phone: salon.phone,
        email: salon.email,
        website: salon.website,
        instagram: salon.instagram,
        address: salon.address,
        about: salon.about,
        logo_url: mediaUrl(c.env, salon.logoKey),
        abn_entity_name: salon.abnEntityName,
        founding: salon.founding,
        free_until: iso(salon.freeUntil),
        listing_credits: salon.listingCredits,
        subscription: {
          status: salon.subscriptionStatus,
          current_period_end: iso(salon.subscriptionCurrentPeriodEnd),
          active: isSubscribed(salon),
        },
        entitlement: entitlement.ok
          ? { ok: true, via: entitlement.via, reason: null }
          : { ok: false, via: null, reason: entitlement.reason },
        owner: owner
          ? {
              id: encodeId("user", owner.id),
              name: owner.name,
              email: realEmail(owner.email),
              phone: owner.phoneNumber,
              banned_at: iso(owner.suspendedAt),
            }
          : null,
        jobs,
        payments: d.payments.map((p) => paymentJson(p, salon)),
        claims: d.claims.map(({ claim, claimant }) => ({
          id: encodeId("claim", claim.id),
          status: claim.status,
          abn: claim.abn,
          contact_name: claim.contactName,
          claimant: {
            id: encodeId("user", claimant.id),
            name: claimant.name,
            email: realEmail(claimant.email),
          },
          decision_note: claim.decisionNote,
          created_at: claim.createdAt.toISOString(),
        })),
      },
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/status`,
    summary: "Suspend, remove or reinstate a salon",
    description:
      "`suspended`: its jobs are hidden and it can't post. `removed`: also gone from the directory. `active` puts it back. Suspending and removing need a reason (the owner sees it) and your passkey (action `salon.suspend` or `salon.remove`, target its ID).",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(
        z.object({
          status: z.enum(STATUSES),
          reason: Reason.optional(),
          confirmation: Confirmation,
        }),
      ),
    },
    responses: { 200: ok(Salon, "The salon"), ...errors, ...notFound },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "salons:moderate");
    const salon = await findSalon(c, ctx.data);
    const { status, reason, confirmation } = c.req.valid("json");
    if (status !== "active" && !reason) {
      throw new ApiError("validation_failed", {
        detail: "Give a reason: the owner sees it",
        hint: "Send `reason`, at least 3 characters.",
        errors: [{ path: "reason", message: "Required when suspending or removing" }],
      });
    }
    const actor =
      status === "active"
        ? ctx.actor
        : await requireConfirmation(
            c,
            ctx,
            status === "suspended" ? "salon.suspend" : "salon.remove",
            encodeId("salon", salon.id),
            confirmation,
          );
    if (c.get("dryRun")) {
      return c.json(
        await salonRow(ctx.data, { ...salon, status, statusReason: reason ?? null }),
        200,
      );
    }
    return c.json(
      await salonRow(ctx.data, await ctx.data.salons.setStatus(salon, status, reason, actor)),
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "delete",
    path: `${LIST}/{id}`,
    summary: "Delete a salon",
    description:
      "Permanently deletes the salon with its jobs, applications, payments and claims. The owner's account stays. Must be confirmed with your passkey (action `salon.delete`, target its ID).",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(z.object({ reason: Reason.optional(), confirmation: Confirmation })),
    },
    responses: {
      200: ok(z.object({ deleted: z.boolean() }), "It is gone"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "salons:delete");
    const salon = await findSalon(c, ctx.data);
    const { reason, confirmation } = c.req.valid("json");
    const actor = await requireConfirmation(
      c,
      ctx,
      "salon.delete",
      encodeId("salon", salon.id),
      confirmation,
    );
    if (c.get("dryRun")) return c.json({ deleted: true }, 200);
    await deleteFiles(c, await ctx.data.salons.delete(salon, reason, actor));
    return c.json({ deleted: true }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/abn`,
    summary: "Mark a salon's ABN checked",
    description: "After looking it up on the ABR: `verified` or `failed`.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ status: z.enum(["verified", "failed"]) })) },
    responses: {
      200: ok(Salon, "The salon"),
      ...errors,
      ...notFound,
      409: problemResponse("The salon has no ABN"),
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "salons:moderate");
    const salon = await findSalon(c, data);
    const { status } = c.req.valid("json");
    if (!salon.abn) {
      throw new ApiError("conflict", {
        detail: "This salon has no ABN to check",
        hint: "The owner adds it in their salon settings, or it comes with a claim.",
      });
    }
    if (c.get("dryRun")) return c.json(await salonRow(data, { ...salon, abnStatus: status }), 200);
    return c.json(await salonRow(data, await data.salons.setAbnStatus(salon, status, actor)), 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/free-period`,
    summary: "Extend or end a salon's free period",
    description:
      "`days` adds that many days, from today if it has already ended. `end: true` ends it now.",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(
        z.union([
          z.object({ days: z.number().int().min(1).max(365) }),
          z.object({ end: z.literal(true) }),
        ]),
      ),
    },
    responses: {
      200: ok(z.object({ free_until: z.string().nullable() }), "When the free period ends"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "salons:credits");
    const salon = await findSalon(c, data);
    const change = c.req.valid("json");
    if (c.get("dryRun")) {
      const now = Date.now();
      const from =
        salon.freeUntil && salon.freeUntil.getTime() > now ? salon.freeUntil.getTime() : now;
      const until = "end" in change ? now : from + change.days * 24 * 60 * 60 * 1000;
      return c.json({ free_until: new Date(until).toISOString() }, 200);
    }
    const changed = await data.salons.setFreePeriod(salon, change, actor);
    return c.json({ free_until: iso(changed.freeUntil) }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/credits`,
    summary: "Give or take away listing credits",
    description:
      "A positive `delta` gives free listings (goodwill, a partner deal); a negative one takes them away. Never below zero.",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(
        z.object({
          delta: z
            .number()
            .int()
            .min(-100)
            .max(100)
            .refine((n) => n !== 0, "Give a number other than 0"),
          reason: Reason,
        }),
      ),
    },
    responses: {
      200: ok(z.object({ listing_credits: z.number().int() }), "The salon's credits now"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "salons:credits");
    const salon = await findSalon(c, data);
    const { delta, reason } = c.req.valid("json");
    if (c.get("dryRun"))
      return c.json({ listing_credits: Math.max(salon.listingCredits + delta, 0) }, 200);
    const changed = await data.salons.adjustCredits(salon, delta, reason, actor);
    return c.json({ listing_credits: changed.listingCredits }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/founding`,
    summary: "Switch founding pricing on or off",
    description: "Founding salons pay the lower Salon Plan price for life.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ founding: z.boolean() })) },
    responses: {
      200: ok(z.object({ founding: z.boolean() }), "Whether it's a founding salon"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "salons:credits");
    const salon = await findSalon(c, data);
    const { founding } = c.req.valid("json");
    if (c.get("dryRun")) return c.json({ founding }, 200);
    return c.json(
      { founding: (await data.salons.setFounding(salon, founding, actor)).founding },
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/unclaim`,
    summary: "Detach a salon's owner",
    description:
      "The salon becomes an unclaimed directory listing, which anyone can claim. The owner's account stays.",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: {
      200: ok(Salon, "The salon, unclaimed"),
      ...errors,
      ...notFound,
      409: problemResponse("Nobody owns it"),
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "salons:moderate");
    const salon = await findSalon(c, data);
    if (!salon.ownerId) {
      throw new ApiError("conflict", {
        detail: "This salon has no owner",
        hint: "It is already an unclaimed directory listing.",
      });
    }
    const unclaimed = { ...salon, ownerId: null, claimedAt: null, source: "directory" as const };
    if (c.get("dryRun")) return c.json(await salonRow(data, unclaimed), 200);
    return c.json(await salonRow(data, await data.salons.unclaim(salon, actor)), 200);
  },
);

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max).optional();
const Listing = z
  .object({
    name: z.string().trim().min(1).max(200),
    suburb: z.string().trim().min(1).max(100),
    state: z.enum(AU_STATE_VALUES),
    postcode: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "A 4-digit postcode"),
    address: text(300),
    phone: text(40),
    email: text(254),
    website: text(300),
    instagram: text(100),
    abn: text(20),
    about: text(2000),
  })
  .openapi("AdminListingInput");

const MAX_CSV_BYTES = 5 * 1024 * 1024;

admin.openapi(
  createRoute({
    method: "post",
    path: "/admin/v1/directory/listings",
    summary: "Add a directory listing",
    description:
      "An unclaimed salon in the public directory, which its owner can claim. Refused when a salon with the same ABN, or the same name and postcode, is already listed.",
    tags: ["Admin"],
    request: { body: body(Listing) },
    responses: {
      201: ok(Salon, "The new listing"),
      ...errors,
      409: problemResponse("Already listed"),
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "directory:import");
    const input = cleanListing(c.req.valid("json") as Record<string, string | undefined>);
    if (typeof input === "string") {
      throw new ApiError("validation_failed", {
        detail: input,
        hint: "Fix it and send the listing again.",
      });
    }
    if (c.get("dryRun")) {
      const now = new Date();
      return c.json(
        salonJson({
          salon: {
            id: "00000000-0000-0000-0000-000000000000",
            ...input,
            slug: "new",
            suburbSlug: "new",
            abn: input.abn ?? null,
            abnStatus: input.abn ? "pending" : "not_started",
            status: "active",
            statusReason: null,
            source: "directory",
            claimedAt: null,
            createdAt: now,
          } as AdminSalon,
          owner: null,
          liveJobs: 0,
        }),
        201,
      );
    }
    try {
      const salon = await data.directory.add(input, actor);
      return c.json(salonJson({ salon, owner: null, liveJobs: 0 }), 201);
    } catch (error) {
      if (!(error instanceof DuplicateListingError)) throw error;
      throw new ApiError("conflict", {
        detail: "A salon with that ABN, or the same name and postcode, is already listed",
        hint: "Search for it on the Salons screen.",
      });
    }
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: "/admin/v1/directory/import",
    summary: "Import directory listings from a CSV",
    description: `Send the CSV as \`file\`. Its first row is the header: ${DIRECTORY_CSV_COLUMNS.join(",")} (name, suburb, state and postcode are required). Up to ${DIRECTORY_IMPORT_MAX_ROWS.toLocaleString("en-AU")} rows. Salons already listed (same ABN, or same name and postcode) are skipped as duplicates; rows that don't check out are listed in \`errors\` and skipped. Only import data you may use: a business's own published details, the ABR or licensed data.`,
    tags: ["Admin"],
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z
                .custom<File>((value) => value instanceof File, "Attach the CSV as `file`")
                .openapi({ type: "string", format: "binary" }),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: ok(ImportReport, "What was added, skipped and why"),
      ...errors,
      413: problemResponse("The file is larger than 5MB"),
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "directory:import");
    const { file } = c.req.valid("form");
    if (file.size > MAX_CSV_BYTES) {
      throw new ApiError("file_too_large", { hint: "Split the CSV into files of 5MB or less." });
    }
    const csv = await file.text();
    if (c.get("dryRun")) {
      throw new ApiError("validation_failed", {
        detail: "An import can't be rehearsed",
        hint: "Send it without `dry_run`; duplicates are skipped, so importing the same file twice adds nothing.",
      });
    }
    try {
      return c.json(await data.directory.importCsv(csv, actor), 200);
    } catch (error) {
      if (!(error instanceof DirectoryImportError)) throw error;
      throw new ApiError("validation_failed", {
        detail: error.message,
        hint: `Use the header ${DIRECTORY_CSV_COLUMNS.join(",")}, one listing per row.`,
      });
    }
  },
);
