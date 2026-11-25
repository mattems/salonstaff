/**
 * What the public may see. Shared by the scopes so that "live" means the same thing everywhere:
 * the feed, salon pages, the sitemap, applying and saving.
 */
import { and, eq, gt, isNull, or, type SQL, sql } from "drizzle-orm";
import { jobs, salons } from "./schema";

/** The salon is active and, if it has an owner, the owner isn't banned. Needs `salons` in the query. */
export const visibleSalon = (): SQL =>
  and(
    eq(salons.status, "active"),
    or(
      isNull(salons.ownerId),
      // Written out in full: Drizzle leaves the table off a column in a one-table query.
      sql`not exists (select 1 from users u where u.id = "salons"."owner_id" and u.suspended_at is not null)`,
    ),
  ) as SQL;

/** Published, not expired, at a visible salon. Needs `jobs` joined to `salons`. */
export const liveJob = (): SQL =>
  and(eq(jobs.status, "published"), gt(jobs.expiresAt, sql`now()`), visibleSalon()) as SQL;

/** Was ever published (so has a public page), at a visible salon. Closed and expired ads count. */
export const publicJob = (): SQL =>
  and(sql`${jobs.publishedAt} is not null`, sql`${jobs.status} <> 'draft'`, visibleSalon()) as SQL;

/** Live jobs at the salon in the current row of `salons`. */
export const liveJobCount = () =>
  sql<number>`(select count(*)::int from jobs j where j.salon_id = "salons"."id" and j.status = 'published' and j.expires_at > now())`;

export type Job = typeof jobs.$inferSelect;
export type Salon = typeof salons.$inferSelect;
export interface JobWithSalon {
  job: Job;
  salon: Salon;
}

/** Whether a job is live, from its own row and its salon's (no owner check). */
export const isLive = (job: Job, now = new Date()) =>
  job.status === "published" && job.expiresAt !== null && job.expiresAt > now;

export interface PageOf<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
