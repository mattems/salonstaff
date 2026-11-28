import { createRoute, z } from "@hono/zod-openapi";
import { claims, isClaimed, publicSite, type Salon, salonsFor } from "@salonstaff/db";
import {
  ApiError,
  AU_STATES,
  type AuState,
  BRAND,
  CLAIM_CALL_HOURS,
  CLAIM_CODE_ATTEMPTS,
  callableNumber,
  claimMethods,
  encodeId,
  labelFor,
  maskEmail,
  maskPhone,
  normaliseAuMobile,
  parseSalonsPath,
  plainLine,
  postcodeSchema,
  salonPath,
  salonsLandingPath,
  spokenCode,
  withinCallingHours,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { lookupAbn } from "../lib/abr";
import { userActor } from "../lib/actor";
import { NearQuery, nearFrom } from "../lib/near";
import { appUrl, placeCall, sendEmail, sendSms, tellOwnersAboutClaim } from "../lib/notify";
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
import { mayReach, VERIFY_CODE_MINUTES } from "../lib/verify";
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
    // A page number inside `path` is checked like the `page` parameter: a whole number from 1.
    const inPath = Number(url.searchParams.get("page"));
    const page =
      Number.isSafeInteger(inPath) && inPath >= 1 && inPath <= 10_000 ? inPath : query.page;
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
          claimable: !isClaimed(salon),
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
// Adding a salon: is it listed already? (D-22)
// ---------------------------------------------------------------------------

const SalonMatchSchema = DirectorySalonSchema.extend({
  postcode: z.string(),
  score: z.number().openapi({ description: "How alike the names are, from 0 to 1." }),
  yourRole: z.enum(["owner", "manager"]).nullable().openapi({
    description: "You're on its team already.",
  }),
}).openapi("SalonMatch");

directoryRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salons/matches",
    summary: "Listed salons that may be yours",
    description: `For adding a salon (D-22): listed salons with a name like \`name\`, in \`postcode\` or within 15km of it, best match first (up to 8). Claimed ones are included (\`claimed\`), and ones you're on the team of (\`yourRole\`). Claim a match with POST /v1/salons/{id}/claims; with none, add it with POST /v1/employer/salons.`,
    tags: TAGS,
    request: {
      query: z.object({
        name: z.string().trim().min(2).max(120),
        postcode: postcodeSchema.optional(),
      }),
    },
    responses: {
      200: json(z.object({ items: z.array(SalonMatchSchema) }).openapi("SalonMatches"), "Matches"),
      400: errors[400],
      401: errors[401],
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const query = c.req.valid("query");
    const db = await c.get("db")();
    const site = publicSite(db);
    const near = query.postcode ? await site.postcodeCentre(query.postcode) : null;
    const [matches, mine] = await Promise.all([
      site.salonMatches({ name: query.name, postcode: query.postcode, near: near ?? undefined }),
      salonsFor(db).ofUser(session.user.id),
    ]);
    const roles = new Map(mine.map((m) => [m.salon.id, m.role]));
    return c.json(
      {
        items: matches.map((m) => ({
          ...directorySalonJson(c.env, { salon: m.salon, liveJobs: 0, distanceKm: m.distanceKm }),
          postcode: m.salon.postcode,
          score: Math.round(m.score * 100) / 100,
          yourRole: roles.get(m.salon.id) ?? null,
        })),
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

const SalonParams = z.object({ id: pathParam("id", "sln_01k6q2x8h4f7tbn3m9vz5cdr0e") });
const ClaimConfirmedSchema = z
  .object({ claim: ClaimSchema, salon: MySalonSchema })
  .openapi("ClaimConfirmed");
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
      .nullish()
      .transform((v) => v?.replace(/\s+/g, "") || null)
      .pipe(
        z
          .string()
          .regex(/^\d{11}$/, "ABN must be 11 digits")
          .nullable(),
      )
      .openapi({
        type: "string",
        description:
          "The business's ABN. Optional when a code proves the claim; needed for `method: review`. When given it must match the listing's, or be active on the ABR.",
      }),
    contactName: z.string().trim().min(1, "Required").max(120),
    phone: z.string().trim().min(8, "Required").max(20),
    method: z.enum(["email", "phone", "call", "review"]).default("email").openapi({
      description:
        "`email`: a code (and a link) to the listing's own business email, when it has one. `phone`: a code by SMS to the listing's own mobile, when its number is one. `call`: a phone call to the listing's own landline or mobile that reads out a code, between 8am and 8pm the salon's time. `review`: staff check it. See GET /v1/salons/{id}/claim-options.",
    }),
  })
  .openapi("StartClaim");

const ClaimOptionsSchema = z
  .object({
    salonId: z.string(),
    claimed: z.boolean().openapi({
      description: "It has owners already: they're emailed if your claim is approved.",
    }),
    abnOnFile: z.boolean().openapi({
      description:
        "The listing has an ABN: yours must match it. Otherwise it must be active on the ABR.",
    }),
    methods: z.array(
      z.object({
        method: z.enum(["email", "phone", "call", "review"]),
        sentTo: z.string().nullable().openapi({
          description: "Where the code would go, masked. Null for `review`.",
        }),
        unavailable: z.string().nullable().openapi({
          description: "Why it can't be used right now (a call outside calling hours), or null.",
        }),
      }),
    ),
    codeAttempts: z.number().int().openapi({ description: "Wrong codes a claim takes." }),
  })
  .openapi("ClaimOptions");

directoryRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salons/{id}/claim-options",
    summary: "How a listing can be claimed",
    description:
      "The ways you can prove you run it (D-04, D-22): a code to the listing's own email, a code by SMS to its own mobile (when its number is one), or a staff check. Only details already on the listing are used, never ones the claimant gives; they're shown masked.",
    tags: TAGS,
    request: { params: SalonParams },
    responses: {
      200: json(ClaimOptionsSchema, "How it can be claimed"),
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    await requireUser(c);
    const salon = await visibleSalonFrom(c, c.req.valid("param").id);
    return c.json(
      {
        salonId: encodeId("salon", salon.id),
        claimed: isClaimed(salon),
        abnOnFile: Boolean(salon.abn),
        methods: claimMethods(salon).map((method) => ({
          method,
          sentTo:
            method === "email" && salon.email
              ? maskEmail(salon.email)
              : (method === "phone" || method === "call") && salon.phone
                ? maskPhone(salon.phone)
                : null,
          unavailable:
            method === "call" && !withinCallingHours(salon.state, new Date())
              ? `We only call salons between ${CLAIM_CALL_HOURS.from}am and ${CLAIM_CALL_HOURS.until - 12}pm, their time.`
              : null,
        })),
        codeAttempts: CLAIM_CODE_ATTEMPTS,
      },
      200,
    );
  },
);

directoryRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/salons/{id}/claims",
    summary: "Claim a directory listing",
    description: `An ABN is optional when a code proves the claim, and needed for a staff check; when given, it must match the listing's (or, when it has none, be active on the Australian Business Register). Prove you run the business (D-22): with \`method: email\` we send a six-digit code and a link to the listing's own email; with \`method: phone\`, a code by SMS to the listing's own mobile; with \`method: call\`, a phone call to its own landline or mobile that reads out the code (8am to 8pm, the salon's time). Type the code with POST /v1/claims/{id}/code (or open the emailed link) while signed in as you; it lasts ${LINK_HOURS} hours and takes ${CLAIM_CODE_ATTEMPTS} wrong tries. \`sentTo\` shows where it went, masked. Without a listing email, or with \`method: review\`, staff check it. Starting again sends a new code (not within 5 minutes) and counts towards the day's claims. An approved claim makes you an owner of the listing: an unclaimed one gets the free period and founding pricing of a new salon. A listing that already has owners can be claimed too (when someone has left the business); its owners are emailed. You can claim any number of listings.`,
    tags: TAGS,
    request: { params: SalonParams, ...jsonBody(StartClaimBody) },
    responses: {
      201: json(ClaimSchema, "The claim"),
      400: errors[400],
      401: errors[401],
      404: errors[404],
      409: problemResponse("You already own it, or the ABN doesn't match"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const input = c.req.valid("json");
    const salon = await visibleSalonFrom(c, c.req.valid("param").id);
    const data = claims(await c.get("db")());
    const abr = input.abn ? await lookupAbn(c.env, input.abn) : null;
    if (c.get("dryRun")) {
      return c.json(
        {
          id: encodeId("claim", "00000000-0000-0000-0000-000000000000"),
          salonId: c.req.valid("param").id,
          status:
            (input.method === "email" && salon.email) ||
            (input.method === "phone" && salon.phone && normaliseAuMobile(salon.phone)) ||
            (input.method === "call" && callableNumber(salon.phone))
              ? ("pending_email" as const)
              : ("pending_review" as const),
          via: null,
          sentTo: null,
          codeExpiresAt: null,
          decisionNote: null,
          createdAt: new Date().toISOString(),
          decidedAt: null,
        },
        201,
      );
    }
    // A mobile or landline code from Twilio Verify, when it's set up (D-23). Locally only for
    // your own numbers: the directory's are real salons'.
    const verify = c.get("phoneVerify")();
    const listingNumber = !salon.phone
      ? null
      : input.method === "phone"
        ? normaliseAuMobile(salon.phone)
        : input.method === "call"
          ? callableNumber(salon.phone)
          : null;
    const byService = Boolean(verify && listingNumber && mayReach(c.env, listingNumber));
    const actor = userActor(c, session.user.id);
    const started = await data.start(
      {
        salonId: salon.id,
        userId: session.user.id,
        ...input,
        abr,
        codeByService: byService ? { minutes: VERIFY_CODE_MINUTES } : undefined,
      },
      actor,
    );
    if (verify && started.claim.codeService && started.sendTo) {
      try {
        await verify.start(started.sendTo.address, started.sendTo.via === "call" ? "call" : "sms");
      } catch (error) {
        await data.sendFailed(started.claim.id, actor);
        throw error;
      }
    }
    const { code, sendTo, token } = started;
    const name = plainLine(started.salon.name);
    if (code && sendTo?.via === "email") {
      const url = new URL(appUrl(c, "/claim/verify"));
      if (token) url.searchParams.set("token", token);
      sendEmail(c, sendTo.address, {
        subject: `${code} is the code to manage ${name} on ${BRAND.name}`,
        title: "Is this your business?",
        body: `${plainLine(input.contactName)} asked to manage the ${BRAND.name} listing for ${name}. If that's you, or someone you've authorised, enter this code where you asked: ${code}. Or confirm with the button. Both last ${LINK_HOURS} hours and work only for the account that asked. Never share the code with anyone else: whoever has it can manage the listing.`,
        action: "Confirm and manage the listing",
        url: url.toString(),
        footer: "If you didn't expect this, ignore this email: nothing changes.",
      });
    }
    if (code && sendTo?.via === "phone") {
      sendSms(
        c,
        sendTo.address,
        `${BRAND.name}: ${code} is the code to manage the listing for ${name}, asked for by ${plainLine(input.contactName)}. Don't share it. Not you? Ignore this text.`,
      );
    }
    if (code && sendTo?.via === "call") {
      placeCall(
        c,
        sendTo.address,
        `Hello. This is ${BRAND.name}. ${plainLine(input.contactName)} asked to manage the listing for ${name}. If that's you, or someone you've authorised, your code is ${spokenCode(code)}. Don't share it with anyone else. If you didn't expect this call, you can hang up: nothing changes.`,
      );
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
      "Sign in as the person who started the claim first. Completes the claim: you become an owner of the listing and your account an employer account.",
    tags: TAGS,
    request: { params: z.object({ token: pathParam("token", "q2f…") }) },
    responses: {
      200: json(ClaimConfirmedSchema, "Your salon"),
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
    tellOwnersAboutClaim(c, decision.otherOwners, decision.salon, decision.claim.contactName);
    return c.json(
      {
        claim: claimJson(decision.claim, decision.salon),
        salon: mySalonJson(c.env, decision.salon, "owner"),
      },
      200,
    );
  },
);

directoryRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/claims/{id}/code",
    summary: "Confirm a claim with its code",
    description: `The six-digit code sent to the listing's email or mobile (D-22). Only the account that started the claim can use it, and only ${CLAIM_CODE_ATTEMPTS} wrong codes are taken (then start again, or ask staff to check). Completes the claim: you become an owner of the listing.`,
    tags: TAGS,
    request: {
      params: z.object({ id: pathParam("id", "clm_01k6q2x8h4f7tbn3m9vz5cdr0e") }),
      ...jsonBody(
        z
          .object({
            code: z
              .string()
              .trim()
              .regex(/^\d{6}$/, "Enter the 6-digit code"),
          })
          .openapi("ClaimCode"),
      ),
    },
    responses: {
      200: json(ClaimConfirmedSchema, "Your salon"),
      400: problemResponse("Wrong or expired code"),
      401: errors[401],
      404: errors[404],
      409: problemResponse("Not waiting for a code"),
      429: problemResponse("Too many wrong codes"),
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
    if (c.get("dryRun")) {
      throw new ApiError("validation_failed", {
        detail: "A claim code can't be tried out",
        hint: "Send the request without dry_run to confirm the claim.",
      });
    }
    const verify = c.get("phoneVerify")();
    const decision = await claims(await c.get("db")()).confirmCode(
      id,
      session.user.id,
      c.req.valid("json").code,
      userActor(c, session.user.id),
      verify ? (to, code) => verify.check(to, code) : undefined,
    );
    tellOwnersAboutClaim(c, decision.otherOwners, decision.salon, decision.claim.contactName);
    return c.json(
      {
        claim: claimJson(decision.claim, decision.salon),
        salon: mySalonJson(c.env, decision.salon, "owner"),
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
    return c.json(claimJson(claim, { email: null, phone: null }), 200);
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
