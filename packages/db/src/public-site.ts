/**
 * What anyone may see, signed in or not: live jobs, job ads (closed ones keep their page), the
 * salon directory and salon pages, old addresses that redirect, and the sitemap's entries.
 */
import {
  type AuState,
  boundingBox,
  distinctiveWords,
  type EmploymentType,
  type JobRole,
  jobPath,
  type LatLng,
  NAME_MATCH_MIN,
  nameMatchScore,
  salonPath,
} from "@salonstaff/shared";
import { and, asc, between, count, desc, eq, ilike, max, ne, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "./index";
import { contains } from "./like";
import { jobs, postcodes, salons, slugRedirects } from "./schema";
import {
  isClaimed as isClaimedSalon,
  isLive,
  type JobWithSalon,
  liveJob,
  liveJobCount,
  type PageOf,
  publicJob,
  type Salon,
  visibleSalon,
} from "./visibility";

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface SalonMatch {
  salon: Salon;
  /** How alike the names are (`nameMatchScore`), 0 to 1. */
  score: number;
  distanceKm: number | null;
  /** Someone manages it already (claimed, or made by its owner). */
  claimed: boolean;
}

/** How far around the place typed a listing may be and still be offered as the same salon. */
export const MATCH_KM = 15;

/** Within `km` of a point (D-10). Places are at their suburb's centre. */
export interface Near extends LatLng {
  km: number;
}

export interface JobSearch {
  q?: string | undefined;
  near?: Near | undefined;
  role?: JobRole | undefined;
  state?: AuState | undefined;
  suburbSlug?: string | undefined;
  type?: EmploymentType | undefined;
  page: number;
  pageSize: number;
}

export interface SalonSearch {
  q?: string | undefined;
  near?: Near | undefined;
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
  /** How far away it is, when the search was near a point. */
  distanceKm: number | null;
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

type Located = typeof jobs | typeof salons;

/** Kilometres from the search's point to a job's or salon's (the haversine formula, as `distanceKm`). */
function distanceFrom(table: Located, near: LatLng): SQL<number> {
  return sql<number>`(12742 * asin(least(1, sqrt(
    power(sin(radians(${table.latitude} - ${near.latitude}) / 2), 2)
    + cos(radians(${near.latitude})) * cos(radians(${table.latitude}))
      * power(sin(radians(${table.longitude} - ${near.longitude}) / 2), 2)))))`;
}

/** Within the radius: a box the location index can use, then the exact distance. */
function within(table: Located, near: Near): SQL {
  const box = boundingBox(near, near.km);
  return and(
    between(table.latitude, box.south, box.north),
    between(table.longitude, box.west, box.east),
    sql`${distanceFrom(table, near)} <= ${near.km}`,
  ) as SQL;
}

function jobConditions(search: Omit<JobSearch, "page" | "pageSize">): SQL {
  const conditions: (SQL | undefined)[] = [liveJob()];
  if (search.near) conditions.push(within(jobs, search.near));
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
    /** Live jobs, featured first, then the nearest (when near a point), then the newest. */
    async jobs(search: JobSearch): Promise<PageOf<JobWithSalon & { distanceKm: number | null }>> {
      const where = jobConditions(search);
      const distance = search.near ? distanceFrom(jobs, search.near) : sql<null>`null`;
      const [items, [total]] = await Promise.all([
        db
          .select({ job: jobs, salon: salons, distanceKm: distance })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(where)
          .orderBy(
            desc(jobs.featured),
            ...(search.near ? [asc(distance)] : []),
            desc(jobs.publishedAt),
            desc(jobs.id),
          )
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

    /** The centre of a postcode's area, for searching near it. Null for a postcode with no area (PO boxes). */
    async postcodeCentre(postcode: string): Promise<LatLng | null> {
      const [row] = await db
        .select({ latitude: postcodes.latitude, longitude: postcodes.longitude })
        .from(postcodes)
        .where(eq(postcodes.postcode, postcode));
      return row ?? null;
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

    /** The directory: salons with live jobs first, then the nearest (when near a point), then by name. */
    async salons(search: SalonSearch): Promise<PageOf<DirectoryEntry>> {
      const conditions: (SQL | undefined)[] = [visibleSalon()];
      if (search.near) conditions.push(within(salons, search.near));
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
      const distance = search.near ? distanceFrom(salons, search.near) : sql<null>`null`;
      const [rows, [total]] = await Promise.all([
        db
          .select({ salon: salons, liveJobs: liveJobCount(), distanceKm: distance })
          .from(salons)
          .where(where)
          .orderBy(
            sql`${liveJobCount()} desc`,
            ...(search.near ? [asc(distance)] : []),
            asc(salons.name),
            asc(salons.id),
          )
          .limit(search.pageSize)
          .offset((search.page - 1) * search.pageSize),
        db.select({ n: count() }).from(salons).where(where),
      ]);
      return { items: rows, page: search.page, pageSize: search.pageSize, total: total?.n ?? 0 };
    },

    /**
     * Listed salons that may be the one someone is adding (D-22): a name like theirs, near the
     * place they gave (its postcode, or within `MATCH_KM` of it), best first. Without a place,
     * anywhere. Every visible salon counts, claimed or not.
     */
    async salonMatches(input: {
      name: string;
      postcode?: string | undefined;
      near?: LatLng | undefined;
      limit?: number;
    }): Promise<SalonMatch[]> {
      const words = distinctiveWords(input.name)
        .filter((w) => w.length >= 2)
        .slice(0, 6);
      if (words.length === 0) return [];
      const place: SQL[] = [];
      if (input.postcode) place.push(eq(salons.postcode, input.postcode));
      if (input.near) place.push(within(salons, { ...input.near, km: MATCH_KM }));
      const distance = input.near ? distanceFrom(salons, input.near) : sql<null>`null`;
      const rows = await db
        .select({ salon: salons, distanceKm: distance })
        .from(salons)
        .where(
          and(
            visibleSalon(),
            place.length > 0 ? or(...place) : undefined,
            // A word of theirs at the start of a word of the listing's ("bella" finds "Bellas").
            or(...words.map((w) => sql`${salons.name} ~* ${`(^|[^a-z0-9])${escapeRegex(w)}`}`)),
          ),
        )
        .limit(200);
      return rows
        .map(({ salon, distanceKm }) => ({
          salon,
          distanceKm,
          score: nameMatchScore(input.name, salon.name),
          claimed: isClaimedSalon(salon),
        }))
        .filter((m) => m.score >= NAME_MATCH_MIN)
        .sort(
          (a, b) =>
            b.score - a.score ||
            (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
            a.salon.name.localeCompare(b.salon.name),
        )
        .slice(0, input.limit ?? 8);
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
