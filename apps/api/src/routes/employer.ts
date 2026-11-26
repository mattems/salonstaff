import { createRoute, z } from "@hono/zod-openapi";
import { type Job, type Salon, type SalonJob, type SalonTeam, salonsFor } from "@salonstaff/db";
import {
  APPLICATION_STATUSES,
  ApiError,
  type ApplicationStatus,
  applicationStatusSchema,
  BRAND,
  contactMessageSchema,
  decodeId,
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
import { appUrl, notify, sendEmail } from "../lib/notify";
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
  SalonParams,
} from "../lib/schemas";
import { idFrom, requireSalon, requireUser } from "../lib/session";
import { applicantJson, candidateJson, mySalonJson, realEmail, salonJobJson } from "../lib/views";

/**
 * A salon team's pages (D-11): your salons, a salon's settings, jobs and publishing, applicants and
 * candidates. Managers handle jobs and applicants; owners also change the salon's details.
 */
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
function previewSalon(input: SalonInput): Salon {
  const now = new Date();
  return {
    id: NIL_UUID,
    ownerId: null,
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
    latitude: null,
    longitude: null,
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
    path: "/v1/employer/salons",
    summary: "Add a salon",
    description: `You become its owner; an account can have any number of salons (a group's locations). The ABN is checksum-checked, then looked up on the Australian Business Register. If the business is already in the directory (an unclaimed listing with that ABN), claim it instead: the 409's \`hint\` names its claim page. New salons list jobs free for ${PRICING.freePeriodDays} days, and the first ${PRICING.foundingSalonLimit} keep founding pricing. Your account becomes an employer account.`,
    tags: TAGS,
    request: jsonBody(salonSchema),
    responses: {
      201: json(MySalonSchema, "Your salon"),
      400: errors[400],
      401: errors[401],
      409: problemResponse("The business's listing should be claimed instead"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const input = c.req.valid("json");
    if (!isValidAbn(input.abn)) throw abnProblem();
    const salons = salonsFor(await c.get("db")());
    const listing = await salons.unclaimedListingByAbn(input.abn);
    if (listing) {
      throw new ApiError("conflict", {
        detail: `${listing.name} is already in our directory with that ABN`,
        hint: `Claim the listing instead of creating a new one: ${salonPath(listing)}/claim`,
      });
    }
    if (c.get("dryRun")) return c.json(mySalonJson(c.env, previewSalon(input), "owner"), 201);
    const abn = await lookupAbn(c.env, input.abn);
    const salon = await salons.create(session.user.id, input, abn, userActor(c, session.user.id));
    return c.json(mySalonJson(c.env, salon, "owner"), 201);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons",
    summary: "Your salons",
    description:
      "Every salon you're on the team of, with your role there, in the order you joined.",
    tags: TAGS,
    responses: {
      200: json(z.object({ items: z.array(MySalonSchema) }).openapi("MySalons"), "Your salons"),
      401: errors[401],
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const mine = await salonsFor(await c.get("db")()).ofUser(session.user.id);
    return c.json({ items: mine.map(({ salon, role }) => mySalonJson(c.env, salon, role)) }, 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}",
    summary: "One of your salons",
    description:
      "Its details, public `path`, launch terms, whether it can publish a job now (`entitlement`) and your `role`.",
    tags: TAGS,
    request: { params: SalonParams },
    responses: {
      200: json(MySalonSchema, "Your salon"),
      401: errors[401],
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const { salon, role } = await requireSalon(c, c.req.valid("param").salonId);
    return c.json(mySalonJson(c.env, salon, role), 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/employer/salons/{salonId}",
    summary: "Change a salon's details",
    description:
      "Owners only. Send only what changes; a blank or null website, Instagram or about clears it. A new name, suburb or state gives the salon (and its jobs) a new address; the old ones redirect. A new ABN is checked again.",
    tags: TAGS,
    request: { params: SalonParams, ...jsonBody(salonUpdateSchema) },
    responses: {
      200: json(MySalonSchema, "Your salon"),
      400: errors[400],
      401: errors[401],
      403: problemResponse("Only owners change a salon's details"),
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const { salon, scope, actor, role } = await requireSalon(
      c,
      c.req.valid("param").salonId,
      "owner",
    );
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
      return c.json(mySalonJson(c.env, preview, role), 200);
    }
    const abn = abnChanged ? await lookupAbn(c.env, changes.abn as string) : null;
    const updated = await scope.update(changes, abn, actor);
    return c.json(mySalonJson(c.env, updated, role), 200);
  },
);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const JobParams = SalonParams.extend({ id: pathParam("id", "job_01k6q2x8h4f7tbn3m9vz5cdr0e") });
const JOB_HINT =
  "List the salon's jobs with GET /v1/employer/salons/{salonId}/jobs and use an `id` from there.";
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
        hint: "An owner can buy a single listing or start the Salon Plan with POST /v1/employer/salons/{salonId}/billing/checkout; then publish.",
      });
};

const withCounts = (job: Job): SalonJob => ({ ...job, applicants: 0, newApplicants: 0 });

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/jobs",
    summary: "A salon's jobs",
    description:
      "Newest first, drafts included, with how many people applied and how many are new.",
    tags: TAGS,
    request: { params: SalonParams },
    responses: {
      200: json(z.object({ items: z.array(SalonJobSchema) }).openapi("SalonJobs"), "Your jobs"),
      401: errors[401],
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const { salon, scope } = await requireSalon(c, c.req.valid("param").salonId);
    const jobs = await scope.jobs();
    return c.json({ items: jobs.map((job) => salonJobJson(c.env, salon, job)) }, 200);
  },
);

const notifyField = z.array(z.string()).max(100).nullable().openapi({
  description:
    "Who on the team is emailed about new applications: their `userId`s from GET /v1/employer/salons/{salonId}/team. Null (the default) is everyone, including people who join later.",
});

const NewJobBody = jobInputSchema
  .and(
    z.object({
      publish: z.boolean().default(false).openapi({
        description: "Publish straight away (uses the free period, the plan or a credit).",
      }),
      notifyUserIds: notifyField.optional(),
    }),
  )
  .openapi("NewJob");

/** The job's chosen people, checked to be on the team. Undefined keeps what the job has. */
async function notifyFrom(
  team: SalonTeam,
  value: string[] | null | undefined,
): Promise<string[] | null | undefined> {
  if (value === undefined || value === null) return value;
  const ids = [...new Set(value.map((v) => decodeId("user", v)))];
  const onTeam = ids.includes(null) ? [] : await team.onTeam(ids as string[]);
  if (ids.includes(null) || onTeam.length !== ids.length) {
    throw new ApiError("validation_failed", {
      detail: "Someone in `notifyUserIds` isn't on the salon's team",
      hint: "Use `userId`s from GET /v1/employer/salons/{salonId}/team, or null for everyone.",
      errors: [{ path: "notifyUserIds", message: "Not on the team" }],
    });
  }
  return onTeam;
}

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/jobs",
    summary: "Post a job",
    description: `Saved as a draft, or published for ${PRICING.listingDurationDays} days with \`publish: true\`. Publishing uses the free period, then the Salon Plan, then a listing credit; with none of those it's refused (\`listing_needed\`) and nothing is saved.`,
    tags: TAGS,
    request: { params: SalonParams, ...jsonBody(NewJobBody) },
    responses: {
      201: json(SalonJobSchema, "The job"),
      400: errors[400],
      401: errors[401],
      402: problemResponse("A listing credit or the Salon Plan is needed to publish"),
      403: problemResponse("The salon is suspended"),
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const { salon, scope, team, actor } = await requireSalon(c, c.req.valid("param").salonId);
    const { publish, notifyUserIds: notifyParam, ...input } = c.req.valid("json");
    const notifyUserIds = (await notifyFrom(team, notifyParam)) ?? null;
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
        notifyUserIds,
        latitude: null,
        longitude: null,
        createdAt: now,
        updatedAt: now,
      };
      return c.json(salonJobJson(c.env, salon, withCounts(preview)), 201);
    }
    let job = await scope.createJob(input, actor, notifyUserIds);
    if (publish) job = (await scope.publish(job.id, actor)).job;
    return c.json(salonJobJson(c.env, salon, withCounts(job)), 201);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/jobs/{id}",
    summary: "One of your jobs",
    tags: TAGS,
    request: { params: JobParams },
    responses: { 200: json(SalonJobSchema, "The job"), 401: errors[401], 404: errors[404] },
  }),
  async (c) => {
    const { salon, scope } = await requireSalon(c, c.req.valid("param").salonId);
    const job = await scope.job(jobIdFrom(c.req.valid("param").id));
    return c.json(salonJobJson(c.env, salon, job), 200);
  },
);

/** Every field of a job, each optional: what a PATCH may send. */
const JobChanges = z
  .object({ ...jobInputSchema.shape, notifyUserIds: notifyField })
  .partial()
  .openapi("JobChanges");

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
    path: "/v1/employer/salons/{salonId}/jobs/{id}",
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
    const { salon, scope, team, actor } = await requireSalon(c, c.req.valid("param").salonId);
    const jobId = jobIdFrom(c.req.valid("param").id);
    const current = await scope.job(jobId);
    const { notifyUserIds: notifyParam, ...body } = c.req.valid("json");
    const notifyUserIds = await notifyFrom(team, notifyParam);
    const changes = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined),
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
          ...(notifyUserIds === undefined ? {} : { notifyUserIds }),
        }),
        200,
      );
    }
    await scope.updateJob(jobId, merged.data, actor, notifyUserIds);
    return c.json(salonJobJson(c.env, salon, await scope.job(jobId)), 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/jobs/{id}/publish",
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
    const { salon, scope, actor } = await requireSalon(c, c.req.valid("param").salonId);
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
    path: "/v1/employer/salons/{salonId}/jobs/{id}/close",
    summary: "Close a job",
    description: "Stops applications. The ad keeps its address, marked closed.",
    tags: TAGS,
    request: { params: JobParams },
    responses: { 200: json(SalonJobSchema, "The job"), 401: errors[401], 404: errors[404] },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c, c.req.valid("param").salonId);
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
    path: "/v1/employer/salons/{salonId}/jobs/{id}/applicants",
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
    const { salon, scope, actor } = await requireSalon(c, c.req.valid("param").salonId);
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
    path: "/v1/employer/salons/{salonId}/applications/{id}",
    summary: "Move an application along",
    description:
      "The applicant is told (email, or SMS for a mobile-only account) when it becomes shortlisted, interview, hired or declined.",
    tags: TAGS,
    request: {
      params: SalonParams.extend({ id: pathParam("id", "app_01k6q2x8h4f7tbn3m9vz5cdr0e") }),
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
    const { salon, scope, actor } = await requireSalon(c, c.req.valid("param").salonId);
    const param = c.req.valid("param").id;
    const id = idFrom(
      "application",
      param,
      "application",
      "List a job's applicants with GET /v1/employer/salons/{salonId}/jobs/{id}/applicants.",
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
        url: appUrl(c, "/applications"),
      });
    }
    return c.json({ id: param, status: result.application.status }, 200);
  },
);

const CandidateParams = SalonParams.extend({
  userId: pathParam("userId", "usr_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});
const candidateHint =
  "Open a job's applicants, or a profile shared with you, and use its `candidateId`.";
const noCandidate = () =>
  new ApiError("not_found", { detail: "No profile you can see has that ID", hint: candidateHint });

employerRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/candidates/{userId}",
    summary: "A candidate's full profile",
    description:
      "Someone who applied to one of your jobs, or whose profile is open to salons and not hidden from yours (D-13): their full profile, verification, endorsements, how you can contact them (`contact`) and their applications to your salon. Referees' contact details come only with an application, and only where the referee agreed.",
    tags: TAGS,
    request: { params: CandidateParams },
    responses: {
      200: json(CandidateSchema, "The candidate"),
      401: errors[401],
      404: problemResponse("No profile you can see has that ID"),
    },
  }),
  async (c) => {
    const { scope } = await requireSalon(c, c.req.valid("param").salonId);
    const userId = idFrom("user", c.req.valid("param").userId, "candidate", candidateHint);
    const candidate = await scope.candidate(userId);
    if (!candidate) throw noCandidate();
    return c.json(candidateJson(c.env, userId, candidate), 200);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/candidates/{userId}/messages",
    summary: "Message a candidate",
    description:
      "We email your message to them with your name and salon, and replies come straight back to your email: they never see each other's address until they reply. Only if their `contact.message` is true. Your salon can message 25 people a day, each once a day. They see every message in their account.",
    tags: TAGS,
    request: { params: CandidateParams, ...jsonBody(contactMessageSchema) },
    responses: {
      201: json(z.object({ sent: z.literal(true) }).openapi("MessageSent"), "Sent"),
      400: errors[400],
      401: errors[401],
      403: problemResponse("Your salon can't contact job seekers now"),
      404: problemResponse("No profile you can see has that ID"),
      409: problemResponse("They don't take messages, or your account has no email for replies"),
      429: problemResponse("Today's limit reached"),
    },
  }),
  async (c) => {
    const { scope, salon, session, actor } = await requireSalon(c, c.req.valid("param").salonId);
    const userId = idFrom("user", c.req.valid("param").userId, "candidate", candidateHint);
    const { message } = c.req.valid("json");
    const replyTo = session.user.email;
    if (!replyTo) {
      throw new ApiError("conflict", {
        detail: "Add an email to your account first",
        hint: "Replies go to your email. Add one with POST /v1/me/email.",
      });
    }
    if (c.get("dryRun")) {
      const found = await scope.access(userId);
      if (!found?.access.view) throw noCandidate();
      return c.json({ sent: true as const }, 201);
    }
    const { contact } = await scope.contact(
      userId,
      "message",
      { message, senderId: session.user.id },
      actor,
    );
    const to = realEmail(contact.email);
    if (to) {
      const sender = session.user.name || "Someone";
      sendEmail(c, to, {
        subject: `${salon.name} sent you a message`,
        title: `${sender} from ${salon.name} sent you a message`,
        body: `${message}\n\nReply to this email to answer ${sender} directly. ${salon.name}: ${appUrl(c, salonPath(salon))}`,
        action: "Open your inbox",
        url: appUrl(c, "/inbox"),
        replyTo,
        footer: `${salon.name} found you on ${BRAND.name}. To stop them contacting you, hide your profile from them in your account.`,
      });
    }
    return c.json({ sent: true as const }, 201);
  },
);

employerRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/candidates/{userId}/phone",
    summary: "See a candidate's mobile",
    description:
      "Their verified mobile, only if their `contact.phone` is true. Each look is recorded, and they can see which salons looked. Your salon can look at 50 numbers a day; looking at the same one again that day doesn't count.",
    tags: TAGS,
    request: { params: CandidateParams },
    responses: {
      200: json(
        z
          .object({ phone: z.string().openapi({ example: "+61412345678" }) })
          .openapi("CandidatePhone"),
        "Their mobile",
      ),
      401: errors[401],
      403: problemResponse("Your salon can't contact job seekers now"),
      404: problemResponse("No profile you can see has that ID"),
      409: problemResponse("They don't share their number"),
      429: problemResponse("Today's limit reached"),
    },
  }),
  async (c) => {
    const { scope, session, actor } = await requireSalon(c, c.req.valid("param").salonId);
    const userId = idFrom("user", c.req.valid("param").userId, "candidate", candidateHint);
    if (c.get("dryRun")) {
      const found = await scope.access(userId);
      if (!found?.access.phone) throw noCandidate();
      return c.json({ phone: found.contact.phoneNumber ?? "" }, 200);
    }
    const { contact } = await scope.contact(userId, "phone", { senderId: session.user.id }, actor);
    return c.json({ phone: contact.phoneNumber ?? "" }, 200);
  },
);
