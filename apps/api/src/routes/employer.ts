import { createRoute, z } from "@hono/zod-openapi";
import { type Job, type Salon, type SalonJob, salonsFor } from "@salonstaff/db";
import {
  APPLICATION_STATUSES,
  ApiError,
  type ApplicationStatus,
  applicationStatusSchema,
  entitlementOf,
  isValidAbn,
  type JobInput,
  jobInputSchema,
  labelFor,
  PRICING,
  type SalonInput,
  type SalonUpdate,
  salonPath,
  salonSchema,
  salonUpdateSchema,
  slugify,
} from "@salonstaff/shared";
import { lookupAbn } from "../lib/abr";
import { userActor } from "../lib/actor";
import { appUrl, notify } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  ApplicantSchema,
  ApplicationStatusSchema,
  CandidateSchema,
  errors,
  json,
  jsonBody,
  MySalonSchema,
  pathParam,
  SalonJobSchema,
} from "../lib/schemas";
import { idFrom, requireSalon, requireUser } from "../lib/session";
import { applicantJson, candidateJson, mySalonJson, salonJobJson } from "../lib/views";

/** A salon's own account: onboarding, settings, jobs and publishing, applicants and candidates. */
export const employerRoutes = createRouter();

const TAGS = ["Salon"];
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const DAY_MS = 24 * 60 * 60 * 1000;

const abnProblem = () =>
  new ApiError("validation_failed", {
    detail: "That ABN isn't valid",
    hint: "Check the 11 digits at abr.business.gov.au.",
    errors: [{ path: "abn", message: "Not a valid ABN" }],
  });

/** What a salon would look like, for a dry run. */
function previewSalon(input: SalonInput, ownerId: string): Salon {
  const now = new Date();
  return {
    id: NIL_UUID,
    ownerId,
    name: input.name,
    slug: slugify(input.name),
    suburbSlug: slugify(input.suburb),
    abn: input.abn,
    abnStatus: "pending",
    abnEntityName: null,
    contactName: input.contactName,
    phone: input.phone,
    email: null,
    website: input.website ?? null,
    instagram: input.instagram ?? null,
    address: null,
    suburb: input.suburb,
    state: input.state,
    postcode: input.postcode,
    about: input.about ?? null,
    logoKey: null,
    founding: false,
    freeUntil: new Date(now.getTime() + PRICING.freePeriodDays * DAY_MS),
    listingCredits: 0,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionCurrentPeriodEnd: null,
    status: "active",
    statusReason: null,
    source: "owner",
    claimedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// The salon
// ---------------------------------------------------------------------------

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/salon",
    summary: "Create your salon",
    description: `Onboarding. The ABN is checksum-checked, then looked up on the Australian Business Register. If the business is already in the directory (an unclaimed listing with that ABN), claim it instead: the 409's \`hint\` names its claim page. New salons list jobs free for ${PRICING.freePeriodDays} days, and the first ${PRICING.foundingSalonLimit} keep founding pricing. Your account becomes an employer account.`,
    tags: TAGS,
    request: jsonBody(salonSchema),
    responses: {
      201: json(MySalonSchema, "Your salon"),
      400: errors[400],
      401: errors[401],
      409: problemResponse(
        "You already manage a salon, or the business's listing should be claimed",
      ),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const input = c.req.valid("json");
    if (!isValidAbn(input.abn)) throw abnProblem();
    const salons = salonsFor(await c.get("db")());
    if (await salons.ownedBy(session.user.id)) {
      throw new ApiError("conflict", {
        detail: "Your account already manages a salon",
        hint: "Change it with PATCH /v1/salon. Use a different account for another business.",
      });
    }
    const listing = await salons.unclaimedListingByAbn(input.abn);
    if (listing) {
      throw new ApiError("conflict", {
        detail: `${listing.name} is already in our directory with that ABN`,
        hint: `Claim the listing instead of creating a new one: ${salonPath(listing)}/claim`,
      });
    }
    if (c.get("dryRun"))
      return c.json(mySalonJson(c.env, previewSalon(input, session.user.id)), 201);
    const abn = await lookupAbn(c.env, input.abn);
    const salon = await salons.create(session.user.id, input, abn, userActor(c, session.user.id));
    return c.json(mySalonJson(c.env, salon), 201);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salon",
    summary: "Your salon",
    description:
      "Its details, public `path`, launch terms and whether it can publish a job now (`entitlement`).",
    tags: TAGS,
    responses: {
      200: json(MySalonSchema, "Your salon"),
      401: errors[401],
      404: problemResponse("No salon yet"),
    },
  }),
  async (c) => {
    const { salon } = await requireSalon(c);
    return c.json(mySalonJson(c.env, salon), 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/salon",
    summary: "Change your salon's details",
    description:
      "Send only what changes; a blank or null website, Instagram or about clears it. A new name, suburb or state gives the salon (and its jobs) a new address; the old ones redirect. A new ABN is checked again.",
    tags: TAGS,
    request: jsonBody(salonUpdateSchema),
    responses: {
      200: json(MySalonSchema, "Your salon"),
      400: errors[400],
      401: errors[401],
      404: problemResponse("No salon yet"),
    },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c);
    const input = c.req.valid("json");
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as SalonUpdate;
    const abnChanged = changes.abn !== undefined && changes.abn !== salon.abn;
    if (abnChanged && !isValidAbn(changes.abn as string)) throw abnProblem();
    if (c.get("dryRun")) {
      const preview = { ...salon };
      for (const [key, value] of Object.entries(changes)) {
        (preview as Record<string, unknown>)[key] = value ?? null;
      }
      return c.json(mySalonJson(c.env, preview), 200);
    }
    const abn = abnChanged ? await lookupAbn(c.env, changes.abn as string) : null;
    const updated = await scope.update(changes, abn, actor);
    return c.json(mySalonJson(c.env, updated), 200);
  },
);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const JobParams = z.object({ id: pathParam("id", "job_01k6q2x8h4f7tbn3m9vz5cdr0e") });
const JOB_HINT = "List your jobs with GET /v1/salon/jobs and use an `id` from there.";
const jobIdFrom = (value: string) => idFrom("job", value, "job at your salon", JOB_HINT);

const listingNeeded = (salon: Salon) => {
  const entitlement = entitlementOf(salon);
  if (entitlement.ok) return null;
  return entitlement.reason === "suspended"
    ? new ApiError("salon_suspended", {
        detail: `Your salon is ${salon.status}${salon.statusReason ? `: ${salon.statusReason}` : ""}`,
        hint: "Contact support@salonstaff.com.au to sort it out.",
      })
    : new ApiError("listing_needed", {
        detail: "Your free period has ended and there's no listing credit or Salon Plan",
        hint: "Buy a single listing or start the Salon Plan with POST /v1/salon/billing/checkout, then publish.",
      });
};

const withCounts = (job: Job): SalonJob => ({ ...job, applicants: 0, newApplicants: 0 });

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salon/jobs",
    summary: "Your salon's jobs",
    description:
      "Newest first, drafts included, with how many people applied and how many are new.",
    tags: TAGS,
    responses: {
      200: json(z.object({ items: z.array(SalonJobSchema) }).openapi("SalonJobs"), "Your jobs"),
      401: errors[401],
      404: problemResponse("No salon yet"),
    },
  }),
  async (c) => {
    const { salon, scope } = await requireSalon(c);
    const jobs = await scope.jobs();
    return c.json({ items: jobs.map((job) => salonJobJson(c.env, salon, job)) }, 200);
  },
);

const NewJobBody = jobInputSchema
  .and(
    z.object({
      publish: z.boolean().default(false).openapi({
        description: "Publish straight away (uses the free period, the plan or a credit).",
      }),
    }),
  )
  .openapi("NewJob");

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/salon/jobs",
    summary: "Post a job",
    description: `Saved as a draft, or published for ${PRICING.listingDurationDays} days with \`publish: true\`. Publishing uses the free period, then the Salon Plan, then a listing credit; with none of those it's refused (\`listing_needed\`) and nothing is saved.`,
    tags: TAGS,
    request: jsonBody(NewJobBody),
    responses: {
      201: json(SalonJobSchema, "The job"),
      400: errors[400],
      401: errors[401],
      402: problemResponse("A listing credit or the Salon Plan is needed to publish"),
      403: problemResponse("The salon is suspended"),
      404: problemResponse("No salon yet"),
    },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c);
    const { publish, ...input } = c.req.valid("json");
    if (publish) {
      const problem = listingNeeded(salon);
      if (problem) throw problem;
    }
    if (c.get("dryRun")) {
      const now = new Date();
      const preview: Job = {
        ...input,
        payMin: input.payMin ?? null,
        payMax: input.payMax ?? null,
        requirements: input.requirements ?? null,
        id: NIL_UUID,
        salonId: salon.id,
        slug: slugify(`${input.title} ${salon.name}`),
        suburbSlug: slugify(input.suburb),
        status: "draft",
        featured: false,
        paidVia: null,
        publishedAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      };
      return c.json(salonJobJson(c.env, salon, withCounts(preview)), 201);
    }
    let job = await scope.createJob(input, actor);
    if (publish) job = (await scope.publish(job.id, actor)).job;
    return c.json(salonJobJson(c.env, salon, withCounts(job)), 201);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salon/jobs/{id}",
    summary: "One of your jobs",
    tags: TAGS,
    request: { params: JobParams },
    responses: { 200: json(SalonJobSchema, "The job"), 401: errors[401], 404: errors[404] },
  }),
  async (c) => {
    const { salon, scope } = await requireSalon(c);
    const job = await scope.job(jobIdFrom(c.req.valid("param").id));
    return c.json(salonJobJson(c.env, salon, job), 200);
  },
);

/** Every field of a job, each optional: what a PATCH may send. */
const JobChanges = z.object(jobInputSchema.shape).partial().openapi("JobChanges");

const asInput = (job: Job): JobInput => ({
  title: job.title,
  role: job.role,
  employmentType: job.employmentType,
  payMin: job.payMin ?? undefined,
  payMax: job.payMax ?? undefined,
  payPeriod: job.payPeriod,
  suburb: job.suburb,
  state: job.state,
  postcode: job.postcode,
  description: job.description,
  requirements: job.requirements ?? undefined,
  requireQualification: job.requireQualification,
});

employerRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/salon/jobs/{id}",
    summary: "Change a job",
    description:
      "Send only what changes. A new title, suburb or state gives a published ad a new address; the old one redirects.",
    tags: TAGS,
    request: { params: JobParams, ...jsonBody(JobChanges) },
    responses: {
      200: json(SalonJobSchema, "The job"),
      400: errors[400],
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c);
    const jobId = jobIdFrom(c.req.valid("param").id);
    const current = await scope.job(jobId);
    const changes = Object.fromEntries(
      Object.entries(c.req.valid("json")).filter(([, value]) => value !== undefined),
    );
    const merged = jobInputSchema.safeParse({ ...asInput(current), ...changes });
    if (!merged.success) {
      throw new ApiError("validation_failed", {
        hint: "Fix the fields listed in `errors` and send the request again.",
        errors: merged.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    if (c.get("dryRun")) {
      return c.json(
        salonJobJson(c.env, salon, {
          ...current,
          ...merged.data,
          payMin: merged.data.payMin ?? null,
          payMax: merged.data.payMax ?? null,
          requirements: merged.data.requirements ?? null,
        }),
        200,
      );
    }
    await scope.updateJob(jobId, merged.data, actor);
    return c.json(salonJobJson(c.env, salon, await scope.job(jobId)), 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/salon/jobs/{id}/publish",
    summary: "Publish or relist a job",
    description: `Live for ${PRICING.listingDurationDays} days from now. Uses the free period, then the Salon Plan, then a listing credit (taken in the same step). A job that's already live is left alone and nothing is charged.`,
    tags: TAGS,
    request: { params: JobParams },
    responses: {
      200: json(SalonJobSchema, "The job"),
      401: errors[401],
      402: problemResponse("A listing credit or the Salon Plan is needed"),
      403: problemResponse("The salon is suspended"),
      404: errors[404],
    },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c);
    const jobId = jobIdFrom(c.req.valid("param").id);
    if (c.get("dryRun")) {
      const job = await scope.job(jobId);
      const problem = listingNeeded(salon);
      if (problem && job.status !== "published") throw problem;
      return c.json(salonJobJson(c.env, salon, job), 200);
    }
    await scope.publish(jobId, actor);
    return c.json(salonJobJson(c.env, await scope.get(), await scope.job(jobId)), 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/salon/jobs/{id}/close",
    summary: "Close a job",
    description: "Stops applications. The ad keeps its address, marked closed.",
    tags: TAGS,
    request: { params: JobParams },
    responses: { 200: json(SalonJobSchema, "The job"), 401: errors[401], 404: errors[404] },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c);
    const jobId = jobIdFrom(c.req.valid("param").id);
    if (c.get("dryRun")) {
      return c.json(
        salonJobJson(c.env, salon, { ...(await scope.job(jobId)), status: "closed" }),
        200,
      );
    }
    await scope.close(jobId, actor);
    return c.json(salonJobJson(c.env, salon, await scope.job(jobId)), 200);
  },
);

// ---------------------------------------------------------------------------
// Applicants and candidates
// ---------------------------------------------------------------------------

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salon/jobs/{id}/applicants",
    summary: "Who applied for a job",
    description:
      "Newest first, with each person's profile summary and verification. Opening the list marks new applications as viewed (`isNew` says which were new).",
    tags: TAGS,
    request: { params: JobParams },
    responses: {
      200: json(
        z.object({ job: SalonJobSchema, items: z.array(ApplicantSchema) }).openapi("Applicants"),
        "The applicants",
      ),
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c);
    const jobId = jobIdFrom(c.req.valid("param").id);
    const { applicants } = await scope.applicants(jobId, { markViewed: true, actor });
    const job = await scope.job(jobId);
    return c.json(
      {
        job: salonJobJson(c.env, salon, job),
        items: applicants.map((row) => applicantJson(c.env, row)),
      },
      200,
    );
  },
);

/** Statuses the applicant is told about. */
const NOTIFY: ApplicationStatus[] = ["shortlisted", "interview", "hired", "declined"];

employerRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/salon/applications/{id}",
    summary: "Move an application along",
    description:
      "The applicant is told (email, or SMS for a mobile-only account) when it becomes shortlisted, interview, hired or declined.",
    tags: TAGS,
    request: {
      params: z.object({ id: pathParam("id", "app_01k6q2x8h4f7tbn3m9vz5cdr0e") }),
      ...jsonBody(applicationStatusSchema),
    },
    responses: {
      200: json(
        z
          .object({ id: z.string(), status: ApplicationStatusSchema })
          .openapi("ApplicationStatusChanged"),
        "The new status",
      ),
      400: errors[400],
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c);
    const param = c.req.valid("param").id;
    const id = idFrom(
      "application",
      param,
      "application",
      "List a job's applicants with GET /v1/salon/jobs/{id}/applicants.",
    );
    const { status } = c.req.valid("json");
    if (c.get("dryRun")) {
      await scope.application(id);
      return c.json({ id: param, status }, 200);
    }
    const result = await scope.setApplicationStatus(id, status, actor);
    if (NOTIFY.includes(status) && result.before !== status) {
      notify(c, result.contact, {
        subject: `Update on your application: ${result.job.title}`,
        title: `${salon.name} updated your application`,
        body: `Your application for "${result.job.title}" is now: ${labelFor(APPLICATION_STATUSES, status)}.`,
        action: "See your applications",
        url: appUrl(c, "/account/applications"),
      });
    }
    return c.json({ id: param, status: result.application.status }, 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/salon/candidates/{userId}",
    summary: "A candidate's full profile",
    description:
      "Only for someone who applied to one of your jobs: their full profile, verification, contact details and their applications to your salon.",
    tags: TAGS,
    request: {
      params: z.object({ userId: pathParam("userId", "usr_01k6q2x8h4f7tbn3m9vz5cdr0e") }),
    },
    responses: {
      200: json(CandidateSchema, "The candidate"),
      401: errors[401],
      404: problemResponse("Nobody with that ID applied to your salon"),
    },
  }),
  async (c) => {
    const { scope } = await requireSalon(c);
    const hint = "Open a job's applicants and use a `candidateId` from there.";
    const userId = idFrom("user", c.req.valid("param").userId, "candidate", hint);
    const candidate = await scope.candidate(userId);
    if (!candidate) {
      throw new ApiError("not_found", {
        detail: "Nobody with that ID applied to your salon",
        hint,
      });
    }
    return c.json(candidateJson(c.env, userId, candidate), 200);
  },
);
