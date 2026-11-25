/**
 * What anyone may see, signed in or not: live jobs, job ads (closed ones keep their page), the
 * salon directory and salon pages, old addresses that redirect, and the sitemap's entries.
 */
import {
  type AuState,
  type EmploymentType,
  type JobRole,
  jobPath,
  salonPath,
} from "@salonstaff/shared";
import { and, asc, count, desc, eq, ilike, max, ne, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "./index";
import { contains } from "./like";
import { jobs, salons, slugRedirects } from "./schema";
import {
  isLive,
  type JobWithSalon,
  liveJob,
  liveJobCount,
  type PageOf,
  publicJob,
  type Salon,
  visibleSalon,
} from "./visibility";

export interface JobSearch {
  q?: string | undefined;
  role?: JobRole | undefined;
  state?: AuState | undefined;
  suburbSlug?: string | undefined;
  type?: EmploymentType | undefined;
  page: number;
  pageSize: number;
}

export interface SalonSearch {
  q?: string | undefined;
  state?: AuState | undefined;
  suburbSlug?: string | undefined;
  /** Only salons with a live job. */
  hiring?: boolean | undefined;
  page: number;
  pageSize: number;
}

export interface DirectoryEntry {
  salon: Salon;
  liveJobs: number;
}

export interface Place {
  state: AuState;
  suburbSlug: string;
  slug: string;
}

export interface SitemapData {
  jobs: (Place & { lastmod: Date })[];
  salons: (Place & { lastmod: Date })[];
  /** Every (role, state, suburb) with a live job, and when the newest one was published. */
  jobPlaces: { role: JobRole; state: AuState; suburbSlug: string; lastmod: Date }[];
  /** Every (state, suburb) with a visible salon. */
  salonPlaces: { state: AuState; suburbSlug: string; lastmod: Date }[];
}

function jobConditions(search: Omit<JobSearch, "page" | "pageSize">): SQL {
  const conditions: (SQL | undefined)[] = [liveJob()];
  if (search.role) conditions.push(eq(jobs.role, search.role));
  if (search.state) conditions.push(eq(jobs.state, search.state));
  if (search.suburbSlug) conditions.push(eq(jobs.suburbSlug, search.suburbSlug));
  if (search.type) conditions.push(eq(jobs.employmentType, search.type));
  if (search.q) {
    const pattern = contains(search.q);
    conditions.push(
      or(
        ilike(jobs.title, pattern),
        ilike(jobs.suburb, pattern),
        ilike(jobs.postcode, pattern),
        ilike(salons.name, pattern),
        ilike(jobs.description, pattern),
      ),
    );
  }
  return and(...conditions) as SQL;
}

export function publicSite(db: Db) {
  return {
    /** Live jobs, featured first, then the newest. */
    async jobs(search: JobSearch): Promise<PageOf<JobWithSalon>> {
      const where = jobConditions(search);
      const [items, [total]] = await Promise.all([
        db
          .select({ job: jobs, salon: salons })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(where)
          .orderBy(desc(jobs.featured), desc(jobs.publishedAt), desc(jobs.id))
          .limit(search.pageSize)
          .offset((search.page - 1) * search.pageSize),
        db
          .select({ n: count() })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(where),
      ]);
      return { items, page: search.page, pageSize: search.pageSize, total: total?.n ?? 0 };
    },

    /** How many live jobs each role and state has, given the other filters. */
    async facets(search: Omit<JobSearch, "page" | "pageSize">) {
      const [roles, states] = await Promise.all([
        db
          .select({ role: jobs.role, count: count() })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(jobConditions({ ...search, role: undefined }))
          .groupBy(jobs.role)
          .orderBy(desc(count())),
        db
          .select({ state: jobs.state, count: count() })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(jobConditions({ ...search, state: undefined, suburbSlug: undefined }))
          .groupBy(jobs.state)
          .orderBy(desc(count())),
      ]);
      return { roles, states };
    },

    /** A job anyone can apply for now. */
    async liveJob(jobId: string): Promise<JobWithSalon | null> {
      const [row] = await db
        .select({ job: jobs, salon: salons })
        .from(jobs)
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(and(eq(jobs.id, jobId), liveJob()));
      return row ?? null;
    },

    /** A job ad by its address. Closed and expired ads are still found (`live: false`). */
    async jobByPath(place: Place): Promise<(JobWithSalon & { live: boolean }) | null> {
      const [row] = await db
        .select({ job: jobs, salon: salons })
        .from(jobs)
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(
          and(
            eq(jobs.state, place.state),
            eq(jobs.suburbSlug, place.suburbSlug),
            eq(jobs.slug, place.slug),
            publicJob(),
          ),
        );
      return row ? { ...row, live: isLive(row.job) } : null;
    },

    /** Live jobs like this one: the same role, nearest first (same suburb, then state). */
    async similarJobs(job: JobWithSalon["job"], limit = 5): Promise<JobWithSalon[]> {
      return db
        .select({ job: jobs, salon: salons })
        .from(jobs)
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(and(liveJob(), ne(jobs.id, job.id), eq(jobs.role, job.role)))
        .orderBy(
          sql`(${jobs.state} = ${job.state} and ${jobs.suburbSlug} = ${job.suburbSlug}) desc`,
          sql`(${jobs.state} = ${job.state}) desc`,
          desc(jobs.publishedAt),
        )
        .limit(limit);
    },

    /** A suburb's name as written ("Surry Hills"), from any job or salon there. Null if we know of none. */
    async suburbName(state: AuState, suburbSlug: string): Promise<string | null> {
      const [job] = await db
        .select({ suburb: jobs.suburb })
        .from(jobs)
        .where(and(eq(jobs.state, state), eq(jobs.suburbSlug, suburbSlug)))
        .limit(1);
      if (job) return job.suburb;
      const [salon] = await db
        .select({ suburb: salons.suburb })
        .from(salons)
        .where(and(eq(salons.state, state), eq(salons.suburbSlug, suburbSlug)))
        .limit(1);
      return salon?.suburb ?? null;
    },

    /** Where an old address now lives (for a 301), or null. */
    async redirect(path: string): Promise<string | null> {
      const [row] = await db.select().from(slugRedirects).where(eq(slugRedirects.path, path));
      if (!row) return null;
      const table = row.kind === "job" ? jobs : salons;
      const [target] = await db
        .select({ state: table.state, suburbSlug: table.suburbSlug, slug: table.slug })
        .from(table)
        .where(eq(table.id, row.targetId));
      if (!target) return null;
      const now = (row.kind === "job" ? jobPath : salonPath)(target);
      return now === path ? null : now;
    },

    /** The directory: salons with live jobs first, then by name. */
    async salons(search: SalonSearch): Promise<PageOf<DirectoryEntry>> {
      const conditions: (SQL | undefined)[] = [visibleSalon()];
      if (search.state) conditions.push(eq(salons.state, search.state));
      if (search.suburbSlug) conditions.push(eq(salons.suburbSlug, search.suburbSlug));
      if (search.hiring) conditions.push(sql`${liveJobCount()} > 0`);
      if (search.q) {
        const pattern = contains(search.q);
        conditions.push(
          or(
            ilike(salons.name, pattern),
            ilike(salons.suburb, pattern),
            ilike(salons.postcode, pattern),
          ),
        );
      }
      const where = and(...conditions);
      const [rows, [total]] = await Promise.all([
        db
          .select({ salon: salons, liveJobs: liveJobCount() })
          .from(salons)
          .where(where)
          .orderBy(sql`${liveJobCount()} desc`, asc(salons.name), asc(salons.id))
          .limit(search.pageSize)
          .offset((search.page - 1) * search.pageSize),
        db.select({ n: count() }).from(salons).where(where),
      ]);
      return { items: rows, page: search.page, pageSize: search.pageSize, total: total?.n ?? 0 };
    },

    /** A salon page by its address, with its live jobs. */
    async salonByPath(place: Place): Promise<{ salon: Salon; jobs: JobWithSalon[] } | null> {
      const [salon] = await db
        .select()
        .from(salons)
        .where(
          and(
            eq(salons.state, place.state),
            eq(salons.suburbSlug, place.suburbSlug),
            eq(salons.slug, place.slug),
            visibleSalon(),
          ),
        );
      if (!salon) return null;
      const live = await db
        .select({ job: jobs, salon: salons })
        .from(jobs)
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(and(eq(jobs.salonId, salon.id), liveJob()))
        .orderBy(desc(jobs.featured), desc(jobs.publishedAt));
      return { salon, jobs: live };
    },

    /** A salon anyone can see, by ID (claims start from one). */
    async salon(salonId: string): Promise<Salon | null> {
      const [row] = await db
        .select()
        .from(salons)
        .where(and(eq(salons.id, salonId), visibleSalon()));
      return row ?? null;
    },

    /** Everything the sitemap lists: live jobs, visible salons, and the places that have them. */
    async sitemap(): Promise<SitemapData> {
      const [liveJobs, visibleSalons, jobPlaces, salonPlaces] = await Promise.all([
        db
          .select({
            state: jobs.state,
            suburbSlug: jobs.suburbSlug,
            slug: jobs.slug,
            lastmod: jobs.updatedAt,
          })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(liveJob())
          .orderBy(desc(jobs.publishedAt)),
        db
          .select({
            state: salons.state,
            suburbSlug: salons.suburbSlug,
            slug: salons.slug,
            lastmod: salons.updatedAt,
          })
          .from(salons)
          .where(visibleSalon())
          .orderBy(asc(salons.state), asc(salons.suburbSlug), asc(salons.slug)),
        db
          .select({
            role: jobs.role,
            state: jobs.state,
            suburbSlug: jobs.suburbSlug,
            lastmod: max(jobs.publishedAt),
          })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(liveJob())
          .groupBy(jobs.role, jobs.state, jobs.suburbSlug),
        db
          .select({
            state: salons.state,
            suburbSlug: salons.suburbSlug,
            lastmod: max(salons.updatedAt),
          })
          .from(salons)
          .where(visibleSalon())
          .groupBy(salons.state, salons.suburbSlug),
      ]);
      const epoch = new Date(0);
      return {
        jobs: liveJobs,
        salons: visibleSalons,
        jobPlaces: jobPlaces.map((p) => ({ ...p, lastmod: p.lastmod ?? epoch })),
        salonPlaces: salonPlaces.map((p) => ({ ...p, lastmod: p.lastmod ?? epoch })),
      };
    },
  };
}

export type PublicSite = ReturnType<typeof publicSite>;
