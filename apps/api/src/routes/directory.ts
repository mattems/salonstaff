import { createRoute, z } from "@hono/zod-openapi";
import { claims, publicSite, type Salon } from "@salonstaff/db";
import {
  ApiError,
  AU_STATES,
  type AuState,
  BRAND,
  encodeId,
  labelFor,
  parseSalonsPath,
  salonPath,
  salonsLandingPath,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { lookupAbn } from "../lib/abr";
import { userActor } from "../lib/actor";
import { NearQuery, nearFrom } from "../lib/near";
import { appUrl, sendEmail } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  AuStateSchema,
  BreadcrumbSchema,
  ClaimSchema,
  DirectorySalonSchema,
  errors,
  JobSummarySchema,
  json,
  jsonBody,
  MySalonSchema,
  PageQuery,
  pathParam,
  RedirectSchema,
  SalonListSchema,
} from "../lib/schemas";
import { idFrom, requireUser } from "../lib/session";
import { claimJson, directorySalonJson, jobSummaryJson, mySalonJson, pageJson } from "../lib/views";

/** The public salon directory, salon pages, and claiming a listing (D-04). */
export const directoryRoutes = createRouter();

const TAGS = ["Directory"];
export const SALONS_PAGE_SIZE = 30;
const LINK_HOURS = 48;

const stateLabel = (state: AuState) => labelFor(AU_STATES, state);

directoryRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salons",
    summary: "Search the salon directory",
    description:
      "Salons with live jobs first, then the nearest (when searching near a point), then by name, 30 a page. Includes unclaimed listings. `q` matches the name, suburb and postcode; `suburb` is a suburb's slug; `hiring=true` keeps only salons with a live job. Near me: `lat` and `lng` (or `near` with a postcode) and `km`; salons are placed at their suburb's centre.",
    tags: TAGS,
    request: {
      query: z.object({
        q: z.string().trim().max(100).optional(),
        state: AuStateSchema.optional(),
        suburb: z
          .string()
          .regex(/^[a-z0-9-]{1,80}$/)
          .optional(),
        hiring: z.enum(["true", "false"]).optional(),
        ...NearQuery,
        page: PageQuery,
      }),
    },
    responses: { 200: json(SalonListSchema, "A page of salons"), 400: errors[400] },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const page = await publicSite(await c.get("db")()).salons({
      q: query.q || undefined,
      state: query.state,
      suburbSlug: query.suburb,
      hiring: query.hiring === "true",
      near: await nearFrom(c, query),
      page: query.page,
      pageSize: SALONS_PAGE_SIZE,
    });
    return c.json(
      pageJson(page, (row) => directorySalonJson(c.env, row)),
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// A public address: the directory by place, a salon page, or a redirect
// ---------------------------------------------------------------------------

const SalonsLandingSchema = z
  .object({
    kind: z.literal("landing"),
    path: z.string(),
    state: AuStateSchema.nullable(),
    suburbSlug: z.string().nullable(),
    suburbName: z.string().nullable(),
    heading: z.string().openapi({ example: "Hair and beauty salons in Fitzroy VIC" }),
    breadcrumbs: z.array(BreadcrumbSchema),
    noindex: z.boolean(),
    salons: SalonListSchema,
  })
  .openapi("SalonsLanding");

const PublicSalonSchema = DirectorySalonSchema.extend({
  postcode: z.string(),
  website: z.string().nullable(),
  instagram: z.string().nullable(),
  contact: z
    .object({
      phone: z.string().nullable(),
      email: z.string().nullable(),
      address: z.string().nullable(),
    })
    .nullable()
    .openapi({ description: "Shown only to signed-in visitors." }),
}).openapi("PublicSalon");

const SalonPageSchema = z
  .object({
    kind: z.literal("salon"),
    salon: PublicSalonSchema,
    jobs: z.array(JobSummarySchema),
    claimable: z.boolean().openapi({ description: "Unclaimed: its owner can claim it." }),
    breadcrumbs: z.array(BreadcrumbSchema),
    noindex: z.boolean(),
  })
  .openapi("SalonPage");

const SalonsPathSchema = z
  .union([SalonsLandingSchema, SalonPageSchema, RedirectSchema])
  .openapi("SalonsPath");

function crumbs(state?: AuState, suburbSlug?: string, suburbName?: string | null) {
  const list = [{ name: "Salons", path: salonsLandingPath({}) }];
  if (state) list.push({ name: state, path: salonsLandingPath({ state }) });
  if (state && suburbSlug) {
    list.push({ name: suburbName ?? suburbSlug, path: salonsLandingPath({ state, suburbSlug }) });
  }
  return list;
}

directoryRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salons/by-path",
    summary: "Resolve a /salons address",
    description:
      "What the website shows at a `/salons/...` address (D-07): the directory for a state or suburb (`kind: landing`), a salon's page with its live jobs (`kind: salon`; contact details only for signed-in visitors), or `kind: redirect` for a renamed or moved salon (answer with a 301). Anything else is a 404.",
    tags: TAGS,
    request: {
      query: z.object({
        path: z.string().max(300).openapi({ example: "/salons/vic/fitzroy/the-fade-room" }),
        page: PageQuery,
      }),
    },
    responses: {
      200: json(SalonsPathSchema, "What's at that address"),
      400: errors[400],
      404: problemResponse("Nothing at that address"),
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const url = new URL(query.path, "https://x.invalid");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const page = Number(url.searchParams.get("page")) || query.page;
    const nothing = new ApiError("not_found", {
      detail: `Nothing at ${pathname}`,
      hint: "Salon addresses look like /salons/{state}/{suburb}/{salon}.",
    });
    if (pathname !== "/salons" && !pathname.startsWith("/salons/")) throw nothing;
    const route = parseSalonsPath(pathname.split("/").slice(2).filter(Boolean));
    if (!route) throw nothing;
    const site = publicSite(await c.get("db")());

    if (route.kind === "salon") {
      const found = await site.salonByPath(route);
      if (!found) {
        const target = await site.redirect(pathname);
        if (target) return c.json({ kind: "redirect" as const, redirect: target }, 200);
        throw nothing;
      }
      const { salon, jobs } = found;
      const signedIn = (await c.get("session")()) !== null;
      return c.json(
        {
          kind: "salon" as const,
          salon: {
            ...directorySalonJson(c.env, { salon, liveJobs: jobs.length, distanceKm: null }),
            postcode: salon.postcode,
            website: salon.website,
            instagram: salon.instagram,
            contact: signedIn
              ? { phone: salon.phone, email: salon.email, address: salon.address }
              : null,
          },
          jobs: jobs.map((row) => jobSummaryJson(c.env, row)),
          claimable: salon.ownerId === null,
          breadcrumbs: [
            ...crumbs(salon.state, salon.suburbSlug, salon.suburb),
            { name: salon.name, path: salonPath(salon) },
          ],
          noindex: false,
        },
        200,
      );
    }

    const { state, suburbSlug } = route;
    const suburbName = state && suburbSlug ? await site.suburbName(state, suburbSlug) : null;
    if (suburbSlug && !suburbName) throw nothing;
    const salons = await site.salons({ state, suburbSlug, page, pageSize: SALONS_PAGE_SIZE });
    const where = state ? (suburbName ? `${suburbName} ${state}` : stateLabel(state)) : "Australia";
    return c.json(
      {
        kind: "landing" as const,
        path: salonsLandingPath({ state, suburbSlug }),
        state: state ?? null,
        suburbSlug: suburbSlug ?? null,
        suburbName,
        heading: `Hair and beauty salons in ${where}`,
        breadcrumbs: crumbs(state, suburbSlug, suburbName),
        noindex: salons.total === 0,
        salons: pageJson(salons, (row) => directorySalonJson(c.env, row)),
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

const SalonParams = z.object({ id: pathParam("id", "sln_01k6q2x8h4f7tbn3m9vz5cdr0e") });
const SALON_HINT = "Find the listing with GET /v1/salons and use its `id`.";

async function visibleSalonFrom(c: Context<AppEnv>, value: string): Promise<Salon> {
  const id = idFrom("salon", value, "salon", SALON_HINT);
  const salon = await publicSite(await c.get("db")()).salon(id);
  if (!salon)
    throw new ApiError("not_found", { detail: "No salon with that ID", hint: SALON_HINT });
  return salon;
}

const StartClaimBody = z
  .object({
    abn: z
      .string()
      .transform((v) => v.replace(/\s+/g, ""))
      .pipe(z.string().regex(/^\d{11}$/, "ABN must be 11 digits")),
    contactName: z.string().trim().min(1, "Required").max(120),
    phone: z.string().trim().min(8, "Required").max(20),
    method: z.enum(["email", "review"]).default("email").openapi({
      description:
        "`email`: a link to the listing's business email (when it has one). `review`: staff check it.",
    }),
  })
  .openapi("StartClaim");

directoryRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/salons/{id}/claims",
    summary: "Claim a directory listing",
    description: `The ABN must match the listing's (or, when it has none, be active on the Australian Business Register). Then prove you run the business: with \`method: email\` we send a link to the listing's own email (it lasts ${LINK_HOURS} hours; \`sentTo\` shows where, masked), and opening it while signed in as you completes the claim. Without a listing email, or with \`method: review\`, staff check it. An approved claim makes the listing yours, with the free period and founding pricing of a new salon.`,
    tags: TAGS,
    request: { params: SalonParams, ...jsonBody(StartClaimBody) },
    responses: {
      201: json(ClaimSchema, "The claim"),
      400: errors[400],
      401: errors[401],
      404: errors[404],
      409: problemResponse("Already claimed, the ABN doesn't match, or you already manage a salon"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const input = c.req.valid("json");
    const salon = await visibleSalonFrom(c, c.req.valid("param").id);
    const data = claims(await c.get("db")());
    const abr = await lookupAbn(c.env, input.abn);
    if (c.get("dryRun")) {
      return c.json(
        {
          id: encodeId("claim", "00000000-0000-0000-0000-000000000000"),
          salonId: c.req.valid("param").id,
          status:
            input.method === "email" && salon.email
              ? ("pending_email" as const)
              : ("pending_review" as const),
          sentTo: null,
          decisionNote: null,
          createdAt: new Date().toISOString(),
          decidedAt: null,
        },
        201,
      );
    }
    const started = await data.start(
      { salonId: salon.id, userId: session.user.id, ...input, abr },
      userActor(c, session.user.id),
    );
    if (started.token && started.salon.email) {
      const url = new URL(appUrl(c, "/claim/verify"));
      url.searchParams.set("token", started.token);
      sendEmail(c, started.salon.email, {
        subject: `Confirm you manage ${started.salon.name} on ${BRAND.name}`,
        title: `Is this your business?`,
        body: `${input.contactName} asked to manage the ${BRAND.name} listing for ${started.salon.name}. If that's you, or someone you've authorised, confirm with the button. The link lasts ${LINK_HOURS} hours and works only for the account that asked.`,
        action: "Confirm and manage the listing",
        url: url.toString(),
        footer: "If you didn't expect this, ignore this email: nothing changes.",
      });
    }
    return c.json(claimJson(started.claim, started.salon), 201);
  },
);

directoryRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/claims/verify/{token}",
    summary: "Confirm a claim from its emailed link",
    description:
      "Sign in as the person who started the claim first. Completes the claim: the listing becomes your salon and your account an employer account.",
    tags: TAGS,
    request: { params: z.object({ token: pathParam("token", "q2f…") }) },
    responses: {
      200: json(
        z.object({ claim: ClaimSchema, salon: MySalonSchema }).openapi("ClaimConfirmed"),
        "Your salon",
      ),
      400: problemResponse("The link is invalid or has expired"),
      401: errors[401],
      403: problemResponse("Another account started this claim"),
      409: errors[409],
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const { token } = c.req.valid("param");
    if (c.get("dryRun")) {
      throw new ApiError("validation_failed", {
        detail: "A claim link can't be tried out",
        hint: "Send the request without dry_run to confirm the claim.",
      });
    }
    const decision = await claims(await c.get("db")()).confirm(
      token,
      session.user.id,
      userActor(c, session.user.id),
    );
    return c.json(
      {
        claim: claimJson(decision.claim, decision.salon),
        salon: mySalonJson(c.env, decision.salon),
      },
      200,
    );
  },
);

directoryRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/claims/{id}/review",
    summary: "Ask staff to check a claim instead",
    description: "For when the listing's email can't be reached. The emailed link stops working.",
    tags: TAGS,
    request: { params: z.object({ id: pathParam("id", "clm_01k6q2x8h4f7tbn3m9vz5cdr0e") }) },
    responses: {
      200: json(ClaimSchema, "The claim"),
      401: errors[401],
      404: errors[404],
      409: problemResponse("Already decided"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const id = idFrom(
      "claim",
      c.req.valid("param").id,
      "claim",
      "See your claim with GET /v1/salons/{id}/claims/mine.",
    );
    const db = await c.get("db")();
    const data = claims(db);
    const existing = await data.find(id);
    if (!existing || existing.userId !== session.user.id) {
      throw new ApiError("not_found", {
        detail: "You have no claim with that ID",
        hint: "See your claim with GET /v1/salons/{id}/claims/mine.",
      });
    }
    const claim = c.get("dryRun")
      ? { ...existing, status: "pending_review" as const }
      : await data.requestReview(id, session.user.id, userActor(c, session.user.id));
    return c.json(claimJson(claim, { email: null }), 200);
  },
);

directoryRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salons/{id}/claims/mine",
    summary: "Your claim on a listing",
    description: "Your most recent claim on it, whatever its status.",
    tags: TAGS,
    request: { params: SalonParams },
    responses: {
      200: json(ClaimSchema, "Your claim"),
      401: errors[401],
      404: problemResponse("No claim, or no such salon"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const salon = await visibleSalonFrom(c, c.req.valid("param").id);
    const claim = await claims(await c.get("db")()).mine(salon.id, session.user.id);
    if (!claim) {
      throw new ApiError("not_found", {
        detail: "You haven't claimed this listing",
        hint: "Start a claim with POST /v1/salons/{id}/claims.",
      });
    }
    return c.json(claimJson(claim, salon), 200);
  },
);
