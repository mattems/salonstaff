/**
 * Jobs and payments in the admin portal: search jobs, feature one, take one down, relist one for
 * free; and every payment.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { ADMIN_JOB_FILTERS, type AdminJob, type BackOffice } from "@salonstaff/db";
import { ApiError, encodeId, jobPath } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
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
} from "./admin";
import { JOB_STATES, jobState, Payment, paymentJson } from "./admin-salons";

const LIST = "/admin/v1/jobs";

const Job = z
  .object({
    id: z.string().openapi({ example: "job_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    title: z.string(),
    status: z.enum(JOB_STATES),
    featured: z.boolean(),
    paid_via: z
      .string()
      .nullable()
      .openapi({ description: "free_period, subscription, credit or staff." }),
    suburb: z.string(),
    state: z.string(),
    salon: z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["active", "suspended", "removed"]),
    }),
    applicants: z.number().int(),
    published_at: z.string().nullable(),
    expires_at: z.string().nullable(),
    created_at: z.string(),
    path: z.string(),
  })
  .openapi("AdminJob");

type JobRow = Awaited<ReturnType<BackOffice["jobs"]["search"]>>[number];

function jobJson(row: { job: AdminJob; salon: JobRow["salon"]; applicants: number }) {
  const { job, salon } = row;
  return {
    id: encodeId("job", job.id),
    title: job.title,
    status: jobState(job),
    featured: job.featured,
    paid_via: job.paidVia,
    suburb: job.suburb,
    state: job.state,
    salon: { id: encodeId("salon", salon.id), name: salon.name, status: salon.status },
    applicants: Number(row.applicants),
    published_at: iso(job.publishedAt),
    expires_at: iso(job.expiresAt),
    created_at: job.createdAt.toISOString(),
    path: jobPath(job),
  };
}

async function findJob(c: Context<AppEnv>, data: BackOffice): Promise<JobRow> {
  const [row] = await data.jobs.search({ limit: 1, id: pathId(c, "job", LIST) });
  return row ?? missing("job", LIST);
}

admin.openapi(
  createRoute({
    method: "get",
    path: LIST,
    summary: "Search jobs",
    description:
      "Newest first. `q` matches the title, the salon's name or the suburb. `status`: `live`, `expired` (past its date), `draft`, `closed` or `featured`.",
    tags: ["Admin"],
    request: {
      query: PaginationQuery.extend({
        q: z.string().trim().max(200).optional(),
        status: z.enum(ADMIN_JOB_FILTERS).optional(),
      }),
    },
    responses: { 200: ok(Page(Job), "A page of jobs"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "salons:read");
    const { limit, cursor, q, status } = c.req.valid("query");
    const rows = await data.jobs.search({
      limit: limit + 1,
      before: decodeCursor(cursor),
      q,
      status,
    });
    return c.json(
      page(rows, limit, (row) => row.job.id, jobJson),
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/feature`,
    summary: "Feature a job, or stop featuring it",
    description: "Featured jobs are shown first.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ featured: z.boolean() })) },
    responses: { 200: ok(Job, "The job"), ...errors, ...notFound },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "jobs:moderate");
    const row = await findJob(c, data);
    const { featured } = c.req.valid("json");
    if (c.get("dryRun")) return c.json(jobJson({ ...row, job: { ...row.job, featured } }), 200);
    const job = await data.jobs.setFeatured(row.job, featured, actor);
    return c.json(jobJson({ ...row, job }), 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/take-down`,
    summary: "Take a job down",
    description:
      "Closes a job that breaks the rules: spam, a scam, discrimination. The reason is recorded.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ reason: Reason })) },
    responses: {
      200: ok(Job, "The job, closed"),
      ...errors,
      ...notFound,
      409: problemResponse("It is already closed"),
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "jobs:moderate");
    const row = await findJob(c, data);
    const { reason } = c.req.valid("json");
    if (row.job.status === "closed") {
      throw new ApiError("conflict", {
        detail: "This job is already closed",
        hint: "Relist it if it should be live again.",
      });
    }
    if (c.get("dryRun"))
      return c.json(jobJson({ ...row, job: { ...row.job, status: "closed" } }), 200);
    const job = await data.jobs.takeDown(row.job, reason, actor);
    return c.json(jobJson({ ...row, job }), 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/relist`,
    summary: "Relist a job for free",
    description: "Puts it live for a fresh 30 days without charging the salon (paid via `staff`).",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: {
      200: ok(Job, "The job, live"),
      ...errors,
      ...notFound,
      409: problemResponse("The salon is suspended or removed"),
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "jobs:moderate");
    const row = await findJob(c, data);
    if (row.salon.status !== "active") {
      throw new ApiError("conflict", {
        detail: `The salon is ${row.salon.status}, so its jobs stay hidden`,
        hint: "Reinstate the salon first.",
      });
    }
    if (c.get("dryRun")) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return c.json(
        jobJson({
          ...row,
          job: { ...row.job, status: "published", paidVia: "staff", publishedAt: now, expiresAt },
        }),
        200,
      );
    }
    const job = await data.jobs.relist(row.job, actor);
    return c.json(jobJson({ ...row, job }), 200);
  },
);

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/payments",
    summary: "Payments",
    description: "Every payment, newest first: listing credits and Salon Plans.",
    tags: ["Admin"],
    request: { query: PaginationQuery },
    responses: { 200: ok(Page(Payment), "A page of payments"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "salons:read");
    const { limit, cursor } = c.req.valid("query");
    const rows = await data.payments.list({ limit: limit + 1, before: decodeCursor(cursor) });
    return c.json(
      page(
        rows,
        limit,
        (row) => row.payment.id,
        (row) => paymentJson(row.payment, row.salon),
      ),
      200,
    );
  },
);
