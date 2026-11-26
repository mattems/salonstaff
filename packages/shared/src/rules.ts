/**
 * The rules that decide things, as pure functions with table tests. Change a rule here and
 * nowhere else: the API, web app and admin portal all call these.
 */
import {
  CONTACT_LIMITS,
  type ContactBy,
  PRICING,
  type ProfileVisibility,
  type VerificationStatus,
} from "./constants";

// ---------- ABN ----------

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Australian Business Number checksum (ATO algorithm). Catches typos and made-up numbers. */
export function isValidAbn(abn: string): boolean {
  const digits = abn.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  nums[0] = (nums[0] ?? 0) - 1;
  return nums.reduce((acc, n, i) => acc + n * (ABN_WEIGHTS[i] ?? 0), 0) % 89 === 0;
}

export function formatAbn(abn: string | null | undefined): string {
  if (!abn) return "—";
  const d = abn.replace(/\s+/g, "");
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}

// ---------- Listing entitlements ----------

export interface EntitlementInput {
  status: "active" | "suspended" | "removed";
  freeUntil: Date | null;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: Date | null;
  listingCredits: number;
}

export type Entitlement =
  | { ok: true; via: "free_period" | "subscription" | "credit" }
  | { ok: false; reason: "suspended" | "needs_listing" };

/** How a salon may publish a job right now: free period, then the plan, then a credit. */
export function entitlementOf(salon: EntitlementInput, now = new Date()): Entitlement {
  if (salon.status !== "active") return { ok: false, reason: "suspended" };
  if (salon.freeUntil && salon.freeUntil > now) return { ok: true, via: "free_period" };
  if (isSubscribed(salon, now)) return { ok: true, via: "subscription" };
  if (salon.listingCredits > 0) return { ok: true, via: "credit" };
  return { ok: false, reason: "needs_listing" };
}

export function isSubscribed(
  salon: Pick<EntitlementInput, "subscriptionStatus" | "subscriptionCurrentPeriodEnd">,
  now = new Date(),
): boolean {
  return (
    (salon.subscriptionStatus === "active" || salon.subscriptionStatus === "trialing") &&
    (!salon.subscriptionCurrentPeriodEnd || salon.subscriptionCurrentPeriodEnd > now)
  );
}

export const planPriceCents = (founding: boolean) =>
  founding ? PRICING.foundingPlanMonthlyCents : PRICING.salonPlanMonthlyCents;

/** New salons are founding salons until the founding limit is reached. */
export const isFoundingSlot = (foundingSoFar: number) => foundingSoFar < PRICING.foundingSalonLimit;

// ---------- Verification ----------

/** 0 = not verified, 1 = ID verified, 2 = work-ready (ID + right to work). */
export function verificationLevel(
  identity: VerificationStatus,
  rightToWork: VerificationStatus,
): 0 | 1 | 2 {
  if (identity !== "verified") return 0;
  return rightToWork === "verified" ? 2 : 1;
}

const nameKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "");

/**
 * Whether the name on an ID matches the profile: same last name, and first names where one
 * starts with the other ("Sam" / "Samantha"). Ignores case, accents and punctuation.
 */
export function nameMatches(
  profile: { firstName: string; lastName: string },
  id: { firstName?: string | null; lastName?: string | null },
): boolean {
  if (!id.firstName || !id.lastName) return false;
  const [pf, pl, idf, idl] = [profile.firstName, profile.lastName, id.firstName, id.lastName].map(
    nameKey,
  );
  if (!pf || !pl || !idf || !idl) return false;
  return pl === idl && (idf.startsWith(pf) || pf.startsWith(idf));
}

// ---------- Applying ----------

export type ApplyBlocker =
  | "login"
  | "employer"
  | "applied"
  | "profile"
  | "verify"
  | "qualification";

export interface EligibilityInput {
  signedIn: boolean;
  role?: "seeker" | "employer" | undefined;
  hasProfile: boolean;
  identity: VerificationStatus;
  qualification: VerificationStatus;
  alreadyApplied: boolean;
  requireQualification: boolean;
}

const BLOCKER_REASONS: Record<ApplyBlocker, string> = {
  login: "Sign in to apply",
  employer: "Employer accounts can't apply for jobs",
  applied: "You've already applied",
  profile: "Complete your profile first",
  verify: "Verify your identity before applying",
  qualification: "This salon requires a verified qualification",
};

/** Whether someone may apply for a job, and if not, why (in the order they'd fix it). */
export function eligibilityOf(
  input: EligibilityInput,
): { canApply: true } | { canApply: false; blocker: ApplyBlocker; reason: string } {
  const no = (blocker: ApplyBlocker) => ({
    canApply: false as const,
    blocker,
    reason: BLOCKER_REASONS[blocker],
  });
  if (!input.signedIn) return no("login");
  if (input.role === "employer") return no("employer");
  if (input.alreadyApplied) return no("applied");
  if (!input.hasProfile) return no("profile");
  if (input.identity !== "verified") return no("verify");
  if (input.requireQualification && input.qualification !== "verified") return no("qualification");
  return { canApply: true };
}

// ---------- Job seeker profiles (D-13) ----------

export interface SalonAccessInput {
  visibility: ProfileVisibility;
  /** They applied to one of this salon's jobs. */
  applied: boolean;
  /** They hid their profile from this salon. */
  hiddenFromSalon: boolean;
  contactBy: ContactBy;
  /** The account has a real email to send messages to. */
  hasEmail: boolean;
  /** The account has a verified mobile to show. */
  hasMobile: boolean;
}

export interface SalonAccess {
  view: boolean;
  /** Can send a message through us (emailed, reply-to the sender). */
  message: boolean;
  /** Can reveal their mobile. */
  phone: boolean;
}

/**
 * What a salon's team may do with a job seeker's profile. Applying always lets the salon in;
 * otherwise a hidden profile, or one hidden from this salon, stays shut.
 */
export function salonAccessTo(input: SalonAccessInput): SalonAccess {
  const view = input.applied || (input.visibility !== "hidden" && !input.hiddenFromSalon);
  return {
    view,
    message: view && input.contactBy !== "phone" && input.hasEmail,
    phone: view && input.contactBy !== "email" && input.hasMobile,
  };
}

/** A share link works only while the profile is public. */
export const shareLinkWorks = (visibility: ProfileVisibility) => visibility === "public";

/** "Jess", "Taylor" → "Jess T.": the name on a share page. */
export function publicName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0).toUpperCase();
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim();
}

export type ContactLimit = "salon_messages" | "salon_reveals" | "same_person";

/**
 * Whether a salon has used up today's contact (D-13). `salonToday` counts the salon's messages or
 * reveals in the last 24 hours; `personToday` its messages to this person.
 */
export function contactLimitReached(input: {
  kind: "message" | "phone";
  salonToday: number;
  personToday: number;
}): ContactLimit | null {
  if (input.kind === "phone") {
    return input.salonToday >= CONTACT_LIMITS.phoneRevealsPerDay ? "salon_reveals" : null;
  }
  if (input.personToday >= CONTACT_LIMITS.messagesPerPersonPerDay) return "same_person";
  if (input.salonToday >= CONTACT_LIMITS.messagesPerDay) return "salon_messages";
  return null;
}

// ---------- Claims ----------

/** "hello@salon.com" → "he•••@salon.com", for showing where a claim link went. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

/**
 * How a claim can be proven. ABNs are public, so a matching ABN is necessary but not enough:
 * the claimant also clicks a link sent to the listing's business email, or an admin approves.
 */
export function claimMethods(listing: { email: string | null }): ("email" | "review")[] {
  return listing.email ? ["email", "review"] : ["review"];
}

// ---------- Near me (D-10) ----------

/** The radii a "near me" search offers, in kilometres. */
export const SEARCH_RADII_KM = [5, 10, 25, 50, 100] as const;
export type SearchRadiusKm = (typeof SEARCH_RADII_KM)[number];
export const DEFAULT_RADIUS_KM: SearchRadiusKm = 25;

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** The great-circle distance between two points, in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A box holding every point within `km` of `centre`: a cheap, indexable first cut before `distanceKm`. */
export function boundingBox(centre: LatLng, km: number) {
  const dLat = (km / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(toRadians(centre.latitude)), 0.01);
  return {
    south: centre.latitude - dLat,
    north: centre.latitude + dLat,
    west: centre.longitude - dLng,
    east: centre.longitude + dLng,
  };
}

/**
 * A browser's position rounded to 2 decimal places (about 1km) before it goes in a search URL, so
 * links and logs never hold someone's exact location. Suburb centres are coarser than that anyway.
 */
export const roughCoordinate = (degrees: number) => Math.round(degrees * 100) / 100;

/** "800m", "3km", "12km": a distance as shown next to a result. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)}m`;
  return `${Math.round(km)}km`;
}
