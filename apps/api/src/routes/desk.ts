import { createRoute, z } from "@hono/zod-openapi";
import { employerDesk } from "@salonstaff/db";
import { ApiError } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { userActor } from "../lib/actor";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  errors,
  json,
  SalonApplicantsSchema,
  SalonConversationSummarySchema,
  SalonJobSchema,
} from "../lib/schemas";
import { idFrom, requireUser } from "../lib/session";
import { salonConversationSummaryJson, salonJobJson } from "../lib/views";
import { ApplicantsQuery, applicantFilters, applicantsJson } from "./conversations";

/**
 * Every salon you're on the team of, in one place (D-20): jobs, applicants and conversations across
 * all of them, each saying which salon it's for. Acting on one (publishing, a status, a message) is
 * under that salon's own routes, `/v1/employer/salons/{salonId}/…`, which check your role there.
 */
export const deskRoutes = createRouter();

const TAGS = ["Salon"];

const SalonFilter = z.object({
  salonId: z.string().optional().openapi({
    description: "Only this salon's, of yours.",
    example: "sln_01k6q2x8h4f7tbn3m9vz5cdr0e",
  }),
});

/** Your salons, and the one asked for (checked to be yours). */
async function deskFor(c: Context<AppEnv>, salonParam: string | undefined) {
  const session = await requireUser(c);
  const desk = await employerDesk(await c.get("db")(), session.user.id);
  const hint = "List your salons with GET /v1/employer/salons and use an `id` from there.";
  const salonId = salonParam ? idFrom("salon", salonParam, "salon you manage", hint) : undefined;
  if (salonId && !desk.salons.some((m) => m.salon.id === salonId)) {
    throw new ApiError("not_found", { detail: "You don't manage a salon with that ID", hint });
  }
  return { session, desk, salonId, actor: userActor(c, session.user.id) };
}

deskRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/jobs",
    summary: "Jobs at all your salons",
    description:
      "Every job at every salon you're on the team of (or one, with `salonId`), newest first, drafts included, with how many people applied and how many are new. Each job's `salon` says which salon it's for.",
    tags: TAGS,
    request: { query: SalonFilter },
    responses: {
      200: json(z.object({ items: z.array(SalonJobSchema) }).openapi("AllSalonJobs"), "Your jobs"),
      401: errors[401],
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const { desk, salonId } = await deskFor(c, c.req.valid("query").salonId);
    const salons = new Map(desk.salons.map((m) => [m.salon.id, m.salon]));
    const jobs = await desk.jobs(salonId);
    return c.json(
      {
        items: jobs.flatMap((job) => {
          const salon = salons.get(job.salonId);
          return salon ? [salonJobJson(c.env, salon, job)] : [];
        }),
      },
      200,
    );
  },
);

deskRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/applicants",
    summary: "Everyone who applied, at all your salons",
    description:
      "As GET /v1/employer/salons/{salonId}/applicants, across every salon you're on the team of (or one, with `salonId`). Each applicant's `salon` says which. New applications shown become viewed.",
    tags: ["Applicants"],
    request: { query: ApplicantsQuery.extend(SalonFilter.shape) },
    responses: {
      200: json(SalonApplicantsSchema, "The applicants"),
      400: errors[400],
      401: errors[401],
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const { desk, salonId, actor } = await deskFor(c, query.salonId);
    const result = await desk.search({ ...applicantFilters(query), salonId }, actor);
    return c.json(applicantsJson(c.env, result), 200);
  },
);

deskRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/conversations",
    summary: "Conversations at all your salons",
    description:
      "Everyone your salons are talking to (or one salon, with `salonId`), latest message first (the last 200), with how many of their messages the salon's team hasn't read. Open one with GET /v1/employer/salons/{salonId}/candidates/{userId}/conversation, using its `salon.id` and `candidateId`.",
    tags: ["Messages"],
    request: { query: SalonFilter },
    responses: {
      200: json(
        z
          .object({ items: z.array(SalonConversationSummarySchema) })
          .openapi("AllSalonConversations"),
        "The conversations",
      ),
      401: errors[401],
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const { desk, salonId } = await deskFor(c, c.req.valid("query").salonId);
    const rows = await desk.conversations(salonId);
    return c.json({ items: rows.map(salonConversationSummaryJson) }, 200);
  },
);
