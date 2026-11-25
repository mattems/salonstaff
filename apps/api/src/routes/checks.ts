import { createRoute, z } from "@hono/zod-openapi";
import { type Check, checks, seeker, summarise } from "@salonstaff/db";
import { ApiError, encodeId, randomBase62, rightToWorkSchema } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { allowedOrigins, userActor } from "../lib/actor";
import { isLocal } from "../lib/auth-config";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  CheckStatusSchema,
  errors,
  formBody,
  json,
  jsonBody,
  UrlResponse,
  VerificationSchema,
} from "../lib/schemas";
import { requireSeeker } from "../lib/session";
import { deleteUploads, inspectUpload, requireUploadAllowance, storeUpload } from "../lib/storage";
import { createIdentitySession } from "../lib/stripe";
import { verificationJson } from "../lib/views";

/**
 * Verification checks: identity (Stripe Identity, or a mock page locally), right to work and
 * qualifications. Only the verification ID and outcome are kept once decided (D-03).
 */
export const checksRoutes = createRouter();

const TAGS = ["Verification"];

const CheckSchema = z
  .object({
    id: z.string().openapi({ example: "chk_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    kind: z.enum(["identity", "right_to_work", "qualification"]),
    status: CheckStatusSchema,
    reference: z.string().nullable().openapi({ description: "The verification ID, once passed." }),
    title: z.string().nullable().openapi({ description: "A qualification's name." }),
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
  })
  .openapi("Check");

const ChecksSchema = z
  .object({ verification: VerificationSchema, checks: z.array(CheckSchema) })
  .openapi("Checks");

const checkJson = (row: Check) => ({
  id: encodeId("check", row.id),
  kind: row.kind,
  status: row.status,
  reference: row.status === "verified" ? row.reference : null,
  title: typeof row.result.title === "string" ? row.result.title : null,
  createdAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt?.toISOString() ?? null,
});

async function checksJson(c: Context<AppEnv>, userId: string) {
  const rows = await checks(await c.get("db")()).listFor(userId);
  return { verification: verificationJson(summarise(rows)), checks: rows.map(checkJson) };
}

/**
 * Where Stripe (or the mock page) sends the person back to: the website, or the mobile app's
 * own scheme. Anywhere else would make us an open redirect.
 */
function returnUrlFor(c: Context<AppEnv>, requested: string | undefined): string {
  const fallback = `${c.env.APP_ORIGIN}/account/verify`;
  if (!requested) return fallback;
  if (requested.startsWith("salonstaff://")) return requested;
  try {
    const url = new URL(requested);
    if (allowedOrigins(c).includes(url.origin) || url.origin === c.env.APP_ORIGIN)
      return url.toString();
  } catch {}
  throw new ApiError("validation_failed", {
    detail: "`returnUrl` must be on the website or the app",
    hint: `Use an address on ${c.env.APP_ORIGIN}, or the app's salonstaff:// link.`,
    errors: [{ path: "returnUrl", message: "Not an allowed address" }],
  });
}

checksRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/checks",
    summary: "Your verification checks",
    description:
      "Your verification summary (statuses, level and verification IDs) and every check you've started, newest first.",
    tags: TAGS,
    responses: { 200: json(ChecksSchema, "Your checks"), 401: errors[401], 403: errors[403] },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    return c.json(await checksJson(c, session.user.id), 200);
  },
);

checksRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/checks/identity",
    summary: "Start an identity check",
    description:
      "Returns a `url` to send the person to: Stripe Identity's pages (a government ID and a live selfie), or locally a mock page. Afterwards they come back to `returnUrl` (default: the website's /account/verify; the mobile app passes `salonstaff://verify-complete`). The result arrives by webhook: re-read GET /v1/me/checks. Needs a profile first, so the name on the ID can be compared with it.",
    tags: TAGS,
    request: jsonBody(
      z.object({
        returnUrl: z
          .string()
          .max(500)
          .optional()
          .openapi({ example: "salonstaff://verify-complete" }),
      }),
    ),
    responses: {
      200: json(UrlResponse, "Where to send the person"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("Already verified, or no profile yet"),
      503: problemResponse("Identity checks aren't set up here"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const { returnUrl } = c.req.valid("json");
    const back = returnUrlFor(c, returnUrl);
    const db = await c.get("db")();
    const me = seeker(db, session.user.id);
    const profile = await me.profile();
    if (!profile) {
      throw new ApiError("conflict", {
        detail: "Save your profile before verifying your identity",
        hint: "Send your name and details with PUT /v1/me/profile: the name on your ID is compared with it.",
      });
    }
    const summary = await checks(db).summaryFor(session.user.id);
    if (summary.identity === "verified") {
      throw new ApiError("conflict", {
        detail: "Your identity is already verified",
        hint: "Nothing more is needed. Your verification ID is in GET /v1/me/checks.",
      });
    }
    const provider = c.env.IDENTITY_PROVIDER === "stripe" ? "stripe" : "mock";
    if (provider === "mock" && !isLocal(c.env)) {
      throw new ApiError("not_configured", {
        detail: "Identity checks aren't set up on this server",
        hint: "Set IDENTITY_PROVIDER=stripe and the Stripe keys (docs/runbooks/stripe.md).",
      });
    }
    if (c.get("dryRun")) return c.json({ url: back }, 200);
    const actor = userActor(c, session.user.id);
    if (provider === "stripe") {
      const started = await createIdentitySession(c.env, {
        userId: session.user.id,
        email: session.user.email,
        returnUrl: back,
      });
      await checks(db).startIdentity(session.user.id, { provider, providerRef: started.id }, actor);
      return c.json({ url: started.url }, 200);
    }
    const ref = `mock_${randomBase62(12)}`;
    await checks(db).startIdentity(session.user.id, { provider, providerRef: ref }, actor);
    const url = new URL(`${c.env.APP_ORIGIN}/dev/mock-identity`);
    url.searchParams.set("ref", ref);
    if (returnUrl) url.searchParams.set("return", back);
    return c.json({ url: url.toString() }, 200);
  },
);

checksRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/checks/right-to-work",
    summary: "Send your right to work for checking",
    description:
      "Staff check it (VEVO for a visa, so a visa needs its grant number). The grant number and passport country are deleted as soon as it's decided; only the basis and how it was checked are kept.",
    tags: TAGS,
    request: jsonBody(rightToWorkSchema),
    responses: {
      201: json(ChecksSchema, "Your checks"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("Already waiting for review, or already verified"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const input = c.req.valid("json");
    if (input.basis === "visa" && !input.visaGrantNumber) {
      throw new ApiError("validation_failed", {
        detail: "A visa needs its grant number",
        hint: "Enter the visa grant number from your grant letter, so we can check it on VEVO.",
        errors: [{ path: "visaGrantNumber", message: "Required for a visa" }],
      });
    }
    if (c.get("dryRun")) return c.json(await checksJson(c, session.user.id), 201);
    await checks(await c.get("db")()).submitRightToWork(
      session.user.id,
      input,
      userActor(c, session.user.id),
    );
    return c.json(await checksJson(c, session.user.id), 201);
  },
);

checksRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/checks/qualification",
    summary: "Send a qualification for checking",
    description:
      "A certificate (`file`: PDF, JPG, PNG, WebP or HEIC, 8MB at most) and the qualification's `title`, e.g. Cert III in Hairdressing. The certificate is kept privately only until staff decide, then deleted.",
    tags: TAGS,
    request: formBody(
      z.object({
        file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
        title: z.string().trim().min(2, "Enter the qualification's name").max(120),
      }),
    ),
    responses: {
      201: json(ChecksSchema, "Your checks"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("A qualification is already waiting for review"),
      413: problemResponse("Too large"),
      415: problemResponse("Not a PDF or image"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const { file, title } = c.req.valid("form");
    if (c.get("dryRun")) {
      await inspectUpload(file, ["image", "pdf"]);
      return c.json(await checksJson(c, session.user.id), 201);
    }
    await requireUploadAllowance(c.env, session.user.id);
    const { key } = await storeUpload(c.env, file, { bucket: "private", allow: ["image", "pdf"] });
    try {
      await checks(await c.get("db")()).submitQualification(
        session.user.id,
        { title, documentKey: key },
        userActor(c, session.user.id),
      );
    } catch (error) {
      await deleteUploads(c.env, "private", [key]);
      throw error;
    }
    return c.json(await checksJson(c, session.user.id), 201);
  },
);
