/**
 * Public URLs for jobs, salons and the listing ("landing") pages around them. Every link to a
 * public page is built here, so the web app, the sitemap, emails and the mobile app agree.
 *
 * Paths are lowercase and hyphenated with no IDs. State codes and role slugs are fixed lists,
 * so the first segment after /jobs says what kind of page it is.
 */
import { AU_STATE_VALUES, type AuState, type JobRole } from "./constants";

/** Search-friendly words for each role, used in /jobs/{role} URLs. Never change one once live. */
export const ROLE_SLUGS: Record<JobRole, string> = {
  senior_stylist: "senior-stylist",
  stylist: "hairdresser",
  junior_stylist: "junior-stylist",
  apprentice_hair: "apprentice-hairdresser",
  colourist: "colourist",
  barber: "barber",
  beauty_therapist: "beauty-therapist",
  nail_technician: "nail-technician",
  lash_brow: "lash-and-brow-technician",
  makeup_artist: "makeup-artist",
  skin_therapist: "dermal-therapist",
  massage_spa: "massage-therapist",
  apprentice_beauty: "beauty-apprentice",
  salon_manager: "salon-manager",
  receptionist: "salon-receptionist",
  educator: "salon-educator",
};

const ROLE_BY_SLUG = new Map(
  Object.entries(ROLE_SLUGS).map(([role, slug]) => [slug, role as JobRole]),
);
const STATE_SLUGS = new Set(AU_STATE_VALUES.map((s) => s.toLowerCase()));

/** "Willow & Ash Hair" → "willow-and-ash-hair". */
export function slugify(input: string, max = 80): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export const stateSlug = (state: AuState) => state.toLowerCase();

export function stateFromSlug(slug: string): AuState | null {
  return STATE_SLUGS.has(slug) ? (slug.toUpperCase() as AuState) : null;
}

export const roleSlug = (role: JobRole) => ROLE_SLUGS[role];
export const roleFromSlug = (slug: string): JobRole | null => ROLE_BY_SLUG.get(slug) ?? null;

/** The slug a job is stored under (before any -2 suffix for a clash in the same suburb). */
export const jobBaseSlug = (title: string, salonName: string) => slugify(`${title} ${salonName}`);

export interface PlacedSlug {
  state: AuState;
  suburbSlug: string;
  slug: string;
}

export const jobPath = (job: PlacedSlug) =>
  `/jobs/${stateSlug(job.state)}/${job.suburbSlug}/${job.slug}`;
export const salonPath = (salon: PlacedSlug) =>
  `/salons/${stateSlug(salon.state)}/${salon.suburbSlug}/${salon.slug}`;

export interface JobsLanding {
  role?: JobRole | undefined;
  state?: AuState | undefined;
  /** Only with a state. */
  suburbSlug?: string | undefined;
}

export function jobsLandingPath({ role, state, suburbSlug }: JobsLanding): string {
  const parts = ["/jobs"];
  if (role) parts.push(roleSlug(role));
  if (state) {
    parts.push(stateSlug(state));
    if (suburbSlug) parts.push(suburbSlug);
  }
  return parts.join("/");
}

export function salonsLandingPath({ state, suburbSlug }: Omit<JobsLanding, "role">): string {
  const parts = ["/salons"];
  if (state) {
    parts.push(stateSlug(state));
    if (suburbSlug) parts.push(suburbSlug);
  }
  return parts.join("/");
}

export type JobsRoute =
  | { kind: "landing"; role?: JobRole; state?: AuState; suburbSlug?: string }
  | { kind: "job"; state: AuState; suburbSlug: string; slug: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reads the segments after /jobs. Null when they can't be a page of ours (a 404). */
export function parseJobsPath(segments: string[]): JobsRoute | null {
  if (segments.some((s) => !SLUG_RE.test(s)) || segments.length > 3) return null;
  const [first, second, third] = segments;
  if (first === undefined) return { kind: "landing" };
  const state = stateFromSlug(first);
  if (state) {
    if (second === undefined) return { kind: "landing", state };
    if (third === undefined) return { kind: "landing", state, suburbSlug: second };
    return { kind: "job", state, suburbSlug: second, slug: third };
  }
  const role = roleFromSlug(first);
  if (!role) return null;
  if (second === undefined) return { kind: "landing", role };
  const roleState = stateFromSlug(second);
  if (!roleState) return null;
  return third === undefined
    ? { kind: "landing", role, state: roleState }
    : { kind: "landing", role, state: roleState, suburbSlug: third };
}

export type SalonsRoute =
  | { kind: "landing"; state?: AuState; suburbSlug?: string }
  | { kind: "salon"; state: AuState; suburbSlug: string; slug: string };

/** Reads the segments after /salons. */
export function parseSalonsPath(segments: string[]): SalonsRoute | null {
  if (segments.some((s) => !SLUG_RE.test(s)) || segments.length > 3) return null;
  const [first, second, third] = segments;
  if (first === undefined) return { kind: "landing" };
  const state = stateFromSlug(first);
  if (!state) return null;
  if (second === undefined) return { kind: "landing", state };
  if (third === undefined) return { kind: "landing", state, suburbSlug: second };
  return { kind: "salon", state, suburbSlug: second, slug: third };
}

/** A job seeker's share page (D-13). Not indexed; the code is unguessable. */
export const profilePath = (code: string) => `/p/${code}`;

/** Where a referee writes an endorsement, from the link in their email. */
export const endorsePath = (token: string) => `/endorse/${token}`;

/** Picks the first free slug: `base`, `base-2`, `base-3`… */
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
