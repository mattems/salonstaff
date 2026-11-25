import { createRoute, z } from "@hono/zod-openapi";
import type { CurrentSession } from "@salonstaff/auth";
import { checks, type Db, type JobWithSalon, publicSite, salonScope, seeker } from "@salonstaff/db";
import {
  ApiError,
  type ApplyBlocker,
  AU_STATES,
  type AuState,
  applySchema,
  eligibilityOf,
  encodeId,
  JOB_ROLES,
  type JobRole,
  jobsLandingPath,
  LIMITS,
  labelFor,
  parseJobsPath,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { userActor } from "../lib/actor";
import { appUrl, notify } from "../lib/notify";
import { orNull, problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  ApplicationStatusSchema,
  AuStateSchema,
  BreadcrumbSchema,
  EmploymentTypeSchema,
  errors,
  JobDetailSchema,
  JobPageSchema,
  JobRoleSchema,
  JobSummarySchema,
  json,
  jsonBody,
  PageQuery,
  pathParam,
  RedirectSchema,
  ViewerSchema,
} from "../lib/schemas";
import { idFrom, requireUser } from "../lib/session";
import { jobDetailJson, jobSummaryJson, pageJson } from "../lib/views";

/** The public job feed and job ads, applying and saving. */
export const jobsRoutes = createRouter();

const TAGS = ["Jobs"];
export const JOBS_PAGE_SIZE = 20;

const roleLabel = (role: JobRole) => labelFor(JOB_ROLES, role);
const stateLabel = (state: AuState) => labelFor(AU_STATES, state);

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

const FacetsSchema = z
  .object({
    roles: z.array(z.object({ role: JobRoleSchema, count: z.number().int() })),
    states: z.array(z.object({ state: AuStateSchema, count: z.number().int() })),
  })
  .openapi("JobFacets", {
    description: "Live jobs per role and per state, given the other filters.",
  });

jobsRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/jobs",
    summary: "Search live jobs",
    description:
      "Live jobs, featured first, then the newest, 20 a page. Each has its public `path`. `q` matches the title, suburb, postcode, salon name and description. `suburb` is a suburb's slug (`surry-hills`).",
    tags: TAGS,
    request: {
      query: z.object({
        q: z.string().trim().max(100).optional(),
        role: JobRoleSchema.optional(),
        state: AuStateSchema.optional(),
        suburb: z
          .string()
          .regex(/^[a-z0-9-]{1,80}$/)
          .optional()
          .openapi({ example: "surry-hills" }),
        type: EmploymentTypeSchema.optional(),
        page: PageQuery,
      }),
    },
    responses: {
      200: json(
        JobPageSchema.extend({ facets: FacetsSchema }).openapi("JobSearch"),
        "A page of jobs",
      ),
      400: errors[400],
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const site = publicSite(await c.get("db")());
    const search = {
      q: query.q || undefined,
      role: query.role,
      state: query.state,
      suburbSlug: query.suburb,
      type: query.type,
    };
    const [page, facets] = await Promise.all([
      site.jobs({ ...search, page: query.page, pageSize: JOBS_PAGE_SIZE }),
      site.facets(search),
    ]);
    return c.json({ ...pageJson(page, (row) => jobSummaryJson(c.env, row)), facets }, 200);
  },
);

// ---------------------------------------------------------------------------
// A public address: a landing page, a job ad, or a redirect
// ---------------------------------------------------------------------------

const JobsLandingSchema = z
  .object({
    kind: z.literal("landing"),
    path: z.string(),
    role: JobRoleSchema.nullable(),
    state: AuStateSchema.nullable(),
    suburbSlug: z.string().nullable(),
    suburbName: z.string().nullable(),
    heading: z.string().openapi({ example: "Colourist jobs in Surry Hills NSW" }),
    breadcrumbs: z.array(BreadcrumbSchema),
    noindex: z
      .boolean()
      .openapi({ description: "No live jobs here: keep it out of search results." }),
    jobs: JobPageSchema,
  })
  .openapi("JobsLanding");

const JobAdSchema = z
  .object({
    kind: z.literal("job"),
    job: JobDetailSchema,
    closed: z.boolean(),
    noindex: z.boolean().openapi({ description: "Closed ads stay up but out of search results." }),
    breadcrumbs: z.array(BreadcrumbSchema),
    similar: z
      .array(JobSummarySchema)
      .openapi({ description: "Up to 5 live jobs like it, for a closed ad." }),
    viewer: orNull(ViewerSchema).openapi({ description: "Set when signed in." }),
  })
  .openapi("JobAd");

const JobsPathSchema = z
  .union([JobsLandingSchema, JobAdSchema, RedirectSchema])
  .openapi("JobsPath");

function landingHeading(role?: JobRole, state?: AuState, suburbName?: string | null) {
  const what = role ? `${roleLabel(role)} jobs` : "Hair and beauty jobs";
  if (state && suburbName) return `${what} in ${suburbName} ${state}`;
  if (state) return `${what} in ${stateLabel(state)}`;
  return `${what} in Australia`;
}

function landingCrumbs(
  role?: JobRole,
  state?: AuState,
  suburbSlug?: string,
  suburbName?: string | null,
) {
  const crumbs = [{ name: "Jobs", path: jobsLandingPath({}) }];
  if (role) crumbs.push({ name: roleLabel(role), path: jobsLandingPath({ role }) });
  if (state) crumbs.push({ name: state, path: jobsLandingPath({ role, state }) });
  if (state && suburbSlug) {
    crumbs.push({
      name: suburbName ?? suburbSlug,
      path: jobsLandingPath({ role, state, suburbSlug }),
    });
  }
  return crumbs;
}

const BLOCKED_BY: Record<
  ApplyBlocker,
  {
    code: "forbidden" | "conflict" | "not_verified" | "cannot_apply" | "unauthenticated";
    hint: string;
  }
> = {
  login: { code: "unauthenticated", hint: "Sign in, then apply." },
  employer: {
    code: "forbidden",
    hint: "Employer accounts can't apply. Sign in with a job seeker account.",
  },
  applied: { code: "conflict", hint: "See where it's up to with GET /v1/me/applications." },
  profile: { code: "cannot_apply", hint: "Save your profile with PUT /v1/me/profile, then apply." },
  verify: {
    code: "not_verified",
    hint: "Verify your identity with POST /v1/me/checks/identity, then apply.",
  },
  qualification: {
    code: "cannot_apply",
    hint: "Send your certificate with POST /v1/me/checks/qualification; once it's verified you can apply.",
  },
};

/** Whether the signed-in person could apply for this job, and if not, why. */
async function eligibility(db: Db, session: CurrentSession, row: JobWithSalon) {
  const me = seeker(db, session.user.id);
  const [state, profile, summary] = await Promise.all([
    me.viewerState(row.job.id),
    me.profile(),
    checks(db).summaryFor(session.user.id),
  ]);
  const result = eligibilityOf({
    signedIn: true,
    role: session.user.role,
    hasProfile: profile !== null,
    identity: summary.identity,
    qualification: summary.qualification,
    alreadyApplied: state.applied,
    requireQualification: row.job.requireQualification,
  });
  return { state, result };
}

async function viewerFor(c: Context<AppEnv>, db: Db, row: JobWithSalon, live: boolean) {
  const session = await c.get("session")();
  if (!session) return null;
  const { state, result } = await eligibility(db, session, row);
  if (!live) {
    return { ...state, canApply: false, blocker: "closed" as const, reason: "This job has closed" };
  }
  return result.canApply
    ? { ...state, canApply: true, blocker: null, reason: null }
    : { ...state, canApply: false, blocker: result.blocker, reason: result.reason };
}

jobsRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/jobs/by-path",
    summary: "Resolve a /jobs address",
    description:
      "What the website shows at a `/jobs/...` address (D-07). `kind: landing` is a role and/or place listing (`/jobs/hairdresser/nsw/surry-hills`) with its live jobs, `noindex` when there are none. `kind: job` is a job ad; a closed or expired one still answers, with `closed: true` and up to 5 similar live jobs. `kind: redirect` means the ad or salon was renamed or moved: answer with a 301 to `redirect`. Anything else is a 404.",
    tags: TAGS,
    request: {
      query: z.object({
        path: z
          .string()
          .max(300)
          .openapi({ example: "/jobs/nsw/surry-hills/senior-colourist-willow-and-ash-hair" }),
        page: PageQuery,
      }),
    },
    responses: {
      200: json(JobsPathSchema, "What's at that address"),
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
      hint: "Job addresses look like /jobs/{state}/{suburb}/{job} or /jobs/{role}/{state}/{suburb}.",
    });
    if (pathname !== "/jobs" && !pathname.startsWith("/jobs/")) throw nothing;
    const segments = pathname.split("/").slice(2).filter(Boolean);
    const route = parseJobsPath(segments);
    if (!route) throw nothing;
    const db = await c.get("db")();
    const site = publicSite(db);

    if (route.kind === "job") {
      const found = await site.jobByPath(route);
      if (!found) {
        const target = await site.redirect(pathname);
        if (target) return c.json({ kind: "redirect" as const, redirect: target }, 200);
        throw nothing;
      }
      const [similar, viewer] = await Promise.all([
        found.live ? [] : site.similarJobs(found.job, 5),
        viewerFor(c, db, found, found.live),
      ]);
      return c.json(
        {
          kind: "job" as const,
          job: jobDetailJson(c.env, found),
          closed: !found.live,
          noindex: !found.live,
          breadcrumbs: [
            ...landingCrumbs(undefined, found.job.state, found.job.suburbSlug, found.job.suburb),
            { name: found.job.title, path: pathname },
          ],
          similar: similar.map((row) => jobSummaryJson(c.env, row)),
          viewer,
        },
        200,
      );
    }

    const { role, state, suburbSlug } = route;
    const suburbName = state && suburbSlug ? await site.suburbName(state, suburbSlug) : null;
    // A suburb we've never had a job or salon in isn't a page.
    if (suburbSlug && !suburbName) throw nothing;
    const jobs = await site.jobs({ role, state, suburbSlug, page, pageSize: JOBS_PAGE_SIZE });
    return c.json(
      {
        kind: "landing" as const,
        path: jobsLandingPath({ role, state, suburbSlug }),
        role: role ?? null,
        state: state ?? null,
        suburbSlug: suburbSlug ?? null,
        suburbName,
        heading: landingHeading(role, state, suburbName),
        breadcrumbs: landingCrumbs(role, state, suburbSlug, suburbName),
        noindex: jobs.total === 0,
        jobs: pageJson(jobs, (row) => jobSummaryJson(c.env, row)),
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// Applying and saving
// ---------------------------------------------------------------------------

const JobParams = z.object({ id: pathParam("id", "job_01k6q2x8h4f7tbn3m9vz5cdr0e") });
const JOB_HINT = "Find live jobs with GET /v1/jobs and use an `id` from there.";

async function liveJobFrom(c: Context<AppEnv>, value: string) {
  const id = idFrom("job", value, "job", JOB_HINT);
  const row = await publicSite(await c.get("db")()).liveJob(id);
  if (!row) {
    throw new ApiError("not_found", {
      detail: "That job has closed or doesn't exist",
      hint: JOB_HINT,
    });
  }
  return row;
}

const ApplicationCreated = z
  .object({
    id: z.string().openapi({ example: "app_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    status: ApplicationStatusSchema,
    createdAt: z.string(),
    job: JobSummarySchema,
  })
  .openapi("ApplicationCreated");

jobsRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/jobs/{id}/apply",
    summary: "Apply for a job",
    description: `Needs a profile and a verified identity (and a verified qualification if the job asks for one). Up to ${LIMITS.applicationsPerDay} applications a day. The salon is told straight away; they see your full profile and contact details.`,
    tags: TAGS,
    request: { params: JobParams, ...jsonBody(applySchema) },
    responses: {
      201: json(ApplicationCreated, "Your application"),
      400: errors[400],
      401: errors[401],
      403: problemResponse(
        "Not eligible: see `code` (`not_verified`, `cannot_apply`, `forbidden`)",
      ),
      404: problemResponse("No live job with that ID"),
      409: problemResponse("Already applied"),
      429: problemResponse("The daily limit is reached"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const input = c.req.valid("json");
    const row = await liveJobFrom(c, c.req.valid("param").id);
    const db = await c.get("db")();
    const { result } = await eligibility(db, session, row);
    if (!result.canApply) {
      const { code, hint } = BLOCKED_BY[result.blocker];
      throw new ApiError(code, { detail: result.reason, hint });
    }
    const me = seeker(db, session.user.id);
    if ((await me.applicationsToday()) >= LIMITS.applicationsPerDay) {
      throw new ApiError("rate_limited", {
        detail: `You can send up to ${LIMITS.applicationsPerDay} applications a day`,
        hint: "Try again tomorrow.",
      });
    }
    if (c.get("dryRun")) {
      return c.json(
        {
          id: encodeId("application", "00000000-0000-0000-0000-000000000000"),
          status: "submitted" as const,
          createdAt: new Date().toISOString(),
          job: jobSummaryJson(c.env, row),
        },
        201,
      );
    }
    const application = await me.apply(row.job.id, input, userActor(c, session.user.id));
    notify(c, await salonScope(db, row.salon.id).ownerContact(), {
      subject: `New verified applicant for ${row.job.title}`,
      title: `New applicant: ${row.job.title}`,
      body: `Someone with a verified ID applied for "${row.job.title}". Their profile, verification ID and contact details are waiting for you.`,
      action: "Review applicants",
      url: appUrl(c, `/employer/jobs/${encodeId("job", row.job.id)}`),
    });
    return c.json(
      {
        id: encodeId("application", application.id),
        status: application.status,
        createdAt: application.createdAt.toISOString(),
        job: jobSummaryJson(c.env, row),
      },
      201,
    );
  },
);

const SavedSchema = z.object({ saved: z.boolean() }).openapi("SavedState");

jobsRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/jobs/{id}/save",
    summary: "Save a job",
    description: "Keeps it in GET /v1/me/saved. Saving twice is fine.",
    tags: TAGS,
    request: { params: JobParams },
    responses: {
      200: json(SavedSchema, "Saved"),
      401: errors[401],
      404: problemResponse("No live job with that ID"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const row = await liveJobFrom(c, c.req.valid("param").id);
    if (!c.get("dryRun")) {
      await seeker(await c.get("db")(), session.user.id).save(
        row.job.id,
        true,
        userActor(c, session.user.id),
      );
    }
    return c.json({ saved: true }, 200);
  },
);

jobsRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/jobs/{id}/save",
    summary: "Stop saving a job",
    description: "Works for closed jobs too. Removing one that isn't saved is fine.",
    tags: TAGS,
    request: { params: JobParams },
    responses: { 200: json(SavedSchema, "Not saved"), 401: errors[401], 404: errors[404] },
  }),
  async (c) => {
    const session = await requireUser(c);
    const id = idFrom("job", c.req.valid("param").id, "job", JOB_HINT);
    if (!c.get("dryRun")) {
      await seeker(await c.get("db")(), session.user.id).save(
        id,
        false,
        userActor(c, session.user.id),
      );
    }
    return c.json({ saved: false }, 200);
  },
);
