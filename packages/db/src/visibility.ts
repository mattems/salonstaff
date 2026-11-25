/**
 * What the public may see. Shared by the scopes so that "live" means the same thing everywhere:
 * the feed, salon pages, the sitemap, applying and saving.
 */
import { and, eq, gt, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { jobs, salons } from "./schema";

/**
 * A salon is claimed when its owner made it or claimed it, and it then has at least one owner
 * (D-11): the last owner can't leave, and a salon whose last owner goes is deleted or unclaimed.
 */
export const isClaimed = (salon: Pick<Salon, "source" | "claimedAt">) =>
  salon.source === "owner" || salon.claimedAt !== null;

/** `isClaimed` for the salon in the current row of `salons`. */
export const claimed = (): SQL =>
  or(eq(salons.source, "owner"), isNotNull(salons.claimedAt)) as SQL;

/** Nobody manages the salon in the current row of `salons`: an unclaimed directory listing. */
export const unclaimed = (): SQL =>
  and(eq(salons.source, "directory"), isNull(salons.claimedAt)) as SQL;

/**
 * The salon is active and, if it has owners, not all of them are banned. Needs `salons` in the query.
 */
export const visibleSalon = (): SQL =>
  and(
    eq(salons.status, "active"),
    or(
      // Written out in full: Drizzle leaves the table off a column in a one-table query.
      sql`not exists (select 1 from salon_members m where m.salon_id = "salons"."id" and m.role = 'owner')`,
      sql`exists (select 1 from salon_members m join users u on u.id = m.user_id where m.salon_id = "salons"."id" and m.role = 'owner' and u.suspended_at is null)`,
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
