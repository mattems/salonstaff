/**
 * Slugs for public URLs (D-07): unique within a suburb, `-2`, `-3` on a clash, and a 301 redirect
 * from the old path when a job or salon is renamed or moves.
 */
import {
  type AuState,
  jobPath,
  nextFreeSlug,
  type PlacedSlug,
  salonPath,
  slugify,
} from "@salonstaff/shared";
import { and, eq, like, ne, or, sql } from "drizzle-orm";
import type { Executor } from "./audit";
import { contains } from "./like";
import { jobs, salons, slugRedirects } from "./schema";

/** Whether `slug` is `base` or `base-<n>`: the same name, placed after a clash. */
export function slugHasBase(slug: string, base: string): boolean {
  return slug === base || new RegExp(`^${base}-\\d+$`).test(slug);
}

/** `contains` escapes for `%text%`; this is the `text%` form. */
const startsWith = (text: string) => contains(text).slice(1);

async function takenSlugs(
  tx: Executor,
  kind: "job" | "salon",
  place: { state: AuState; suburbSlug: string },
  base: string,
  excludeId: string | undefined,
): Promise<Set<string>> {
  const table = kind === "job" ? jobs : salons;
  const rows = await tx
    .select({ slug: table.slug })
    .from(table)
    .where(
      and(
        eq(table.state, place.state),
        eq(table.suburbSlug, place.suburbSlug),
        or(eq(table.slug, base), like(table.slug, `${startsWith(base)}-%`)),
        excludeId ? ne(table.id, excludeId) : undefined,
      ),
    );
  // An old address someone else redirects from stays theirs, so its links keep working.
  const prefix = (kind === "job" ? jobPath : salonPath)({ ...place, slug: base });
  const redirects = await tx
    .select({ path: slugRedirects.path })
    .from(slugRedirects)
    .where(
      and(
        like(slugRedirects.path, startsWith(prefix)),
        excludeId ? ne(slugRedirects.targetId, excludeId) : undefined,
      ),
    );
  return new Set([
    ...rows.map((r) => r.slug),
    ...redirects.map((r) => r.path.slice(r.path.lastIndexOf("/") + 1)),
  ]);
}

/**
 * The slug a job or salon should have in a place. Keeps its current one when the name and place
 * haven't changed, so a `-2` doesn't jump to a freed-up plain slug.
 */
export async function placeSlug(
  tx: Executor,
  kind: "job" | "salon",
  wanted: { state: AuState; suburb: string; base: string },
  current?: { id: string; state: AuState; suburbSlug: string; slug: string },
): Promise<PlacedSlug> {
  const suburbSlug = slugify(wanted.suburb) || "suburb";
  const base = wanted.base || kind;
  if (
    current &&
    current.state === wanted.state &&
    current.suburbSlug === suburbSlug &&
    slugHasBase(current.slug, base)
  ) {
    return { state: current.state, suburbSlug, slug: current.slug };
  }
  const taken = await takenSlugs(tx, kind, { state: wanted.state, suburbSlug }, base, current?.id);
  return { state: wanted.state, suburbSlug, slug: nextFreeSlug(base, taken) };
}

/** Points an old public path at its job or salon (the API answers it with a 301). */
export async function writeRedirect(
  tx: Executor,
  kind: "job" | "salon",
  from: PlacedSlug,
  targetId: string,
): Promise<void> {
  const path = (kind === "job" ? jobPath : salonPath)(from);
  await tx
    .insert(slugRedirects)
    .values({ path, kind, targetId })
    .onConflictDoUpdate({
      target: slugRedirects.path,
      set: { kind, targetId, createdAt: sql`now()` },
    });
}

export const samePlace = (a: PlacedSlug, b: PlacedSlug) =>
  a.state === b.state && a.suburbSlug === b.suburbSlug && a.slug === b.slug;

/** Postgres's unique-violation code: two requests picked the same slug at once. */
export const isUniqueViolation = (error: unknown): boolean => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/** Runs `fn` again (a few times) if it lost a race for a slug. */
export async function retryOnSlugClash<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 3 || !isUniqueViolation(error)) throw error;
    }
  }
}
