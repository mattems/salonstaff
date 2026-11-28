/**
 * The rules that decide things, as pure functions with table tests. Change a rule here and
 * nowhere else: the API, web app and admin portal all call these.
 */
import {
  type AuState,
  CONTACT_LIMITS,
  type ContactBy,
  PRICING,
  type ProfileVisibility,
  type VerificationStatus,
} from "./constants";
import { normaliseAuLandline, normaliseAuMobile } from "./schemas";

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

/**
 * Whether a profile name change means the ID check has to be done again (D-16): the first or last
 * name is different, ignoring case, accents and punctuation ("jess o'brien" → "Jess OBrien" isn't).
 */
export function nameChangeExpiresIdentity(
  before: { firstName: string; lastName: string },
  after: { firstName: string; lastName: string },
): boolean {
  return (
    nameKey(before.firstName) !== nameKey(after.firstName) ||
    nameKey(before.lastName) !== nameKey(after.lastName)
  );
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
  /** The account has a verified mobile to show. */
  hasMobile: boolean;
}

export interface SalonAccess {
  view: boolean;
  /** Can write to them in their conversation with the salon (D-19). */
  message: boolean;
  /** Can reveal their mobile. */
  phone: boolean;
}

/**
 * What a salon's team may do with a job seeker's profile. Applying always lets the salon in, and
 * write to them; otherwise a hidden profile, or one hidden from this salon, stays shut, and messages
 * need "Messages" in how they take contact.
 */
export function salonAccessTo(input: SalonAccessInput): SalonAccess {
  const view = input.applied || (input.visibility !== "hidden" && !input.hiddenFromSalon);
  return {
    view,
    message: view && (input.applied || input.contactBy !== "phone"),
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
 * Whether a salon has used up today's contact (D-13, D-19).
 * - Number looks: `salonToday` counts the salon's looks in the last 24 hours.
 * - Messages are limited only while it's cold: the person hasn't applied to the salon or replied.
 *   `salonColdToday` counts the people the salon wrote to cold in the last 24 hours; `personToday`
 *   its messages to this person.
 */
export function contactLimitReached(
  input:
    | { kind: "phone"; salonToday: number; senderToday?: number }
    | {
        kind: "message";
        cold: boolean;
        salonColdToday: number;
        personToday: number;
        senderColdToday?: number;
      },
): ContactLimit | null {
  // `sender…` counts the same thing for the person doing it, across every salon they're on:
  // making more salons doesn't make more allowance.
  if (input.kind === "phone") {
    const most = Math.max(input.salonToday, input.senderToday ?? 0);
    return most >= CONTACT_LIMITS.phoneRevealsPerDay ? "salon_reveals" : null;
  }
  if (!input.cold) return null;
  if (input.personToday >= CONTACT_LIMITS.messagesPerPersonPerDay) return "same_person";
  if (Math.max(input.salonColdToday, input.senderColdToday ?? 0) >= CONTACT_LIMITS.messagesPerDay)
    return "salon_messages";
  return null;
}

// ---------- A salon's ABN ----------

const ABN_NAME_NOISE = new Set([
  "the",
  "and",
  "pty",
  "ltd",
  "limited",
  "trustee",
  "for",
  "trust",
  "as",
  "atf",
  "co",
]);

const abnNameWords = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !ABN_NAME_NOISE.has(word));

/**
 * Whether a salon's name is one the Australian Business Register has for its ABN (the entity
 * or one of its business names). ABNs are public, so an active ABN alone says nothing about who
 * typed it: a salon is shown as verified only when its name is the ABN's, or staff say so.
 * The salon's name may be shorter than the registered one ("Fade Room" for "The Fade Room Fitzroy
 * Pty Ltd") but not add to it; a name of one short word doesn't count.
 */
export function abnNameMatches(salonName: string, registeredNames: readonly string[]): boolean {
  const mine = abnNameWords(salonName);
  if (mine.join("").length < 4) return false;
  return registeredNames.some((registered) => {
    const theirs = abnNameWords(registered);
    if (theirs.join("").length < 4) return false;
    // One way only: every word of the salon's name is in the registered one. The other way
    // round would let a registered "Hair Studio" vouch for "Someone Famous Hair Studio".
    return mine.every((word) => theirs.includes(word));
  });
}

/**
 * The ABN status a salon gets from a register lookup (`register`). An active ABN counts as
 * verified only when the salon's name is one of the ABN's, or the person already owns a verified
 * salon with that ABN (another location). Otherwise it waits for staff.
 */
export function salonAbnStatus(input: {
  register: VerificationStatus;
  salonName: string;
  registeredNames: readonly string[];
  ownsVerifiedSalonWithAbn: boolean;
}): VerificationStatus {
  if (input.register !== "verified") return input.register;
  if (input.ownsVerifiedSalonWithAbn) return "verified";
  return abnNameMatches(input.salonName, input.registeredNames) ? "verified" : "pending";
}

// ---------- Claims ----------

/** "hello@salon.com" → "he•••@salon.com", for showing where a claim link went. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(user.length - 2, 3))}@${domain}`;
}

/** "+61412345678" → "04•• ••• 678", for showing where a claim code went. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^61/, "0");
  return `${digits.slice(0, 2)}•• ••• ${digits.slice(-3)}`;
}

export type ClaimMethod = "email" | "phone" | "call" | "review";

/**
 * How a claim can be proven (D-04, D-22). ABNs are public, so a matching ABN is necessary but not
 * enough: the claimant also types a code sent to the listing's own business email (which also
 * carries a link), texted to its own mobile, or read out in a phone call to its own landline, or
 * staff check it. Only details already on the listing count: never an address or number the
 * claimant gives.
 */
export function claimMethods(listing: {
  email: string | null;
  phone: string | null;
}): ClaimMethod[] {
  const methods: ClaimMethod[] = [];
  if (listing.email) methods.push("email");
  if (listing.phone && normaliseAuMobile(listing.phone)) methods.push("phone");
  if (callableNumber(listing.phone)) methods.push("call");
  methods.push("review");
  return methods;
}

/**
 * The number a claim code call goes to: the listing's landline or its mobile (a mobile can take a
 * text or a call, D-22). E.164, or null for a routed 13/1300/1800 number or anything else.
 */
export function callableNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return normaliseAuLandline(phone) ?? normaliseAuMobile(phone);
}

/** Calls that read out a claim code are made only in these hours, the salon's own time. */
export const CLAIM_CALL_HOURS = { from: 8, until: 20 } as const;

const STATE_TIME_ZONES: Record<AuState, string> = {
  NSW: "Australia/Sydney",
  ACT: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  TAS: "Australia/Hobart",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  NT: "Australia/Darwin",
  WA: "Australia/Perth",
};

/** The hour (0–23) it is in a state's capital at `now`. */
export function hourIn(state: AuState, now: Date): number {
  const hour = new Intl.DateTimeFormat("en-AU", {
    timeZone: STATE_TIME_ZONES[state],
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(hour) % 24;
}

/** Whether a salon in `state` may be phoned with a claim code at `now` (8am to 8pm there). */
export function withinCallingHours(state: AuState, now: Date): boolean {
  const hour = hourIn(state, now);
  return hour >= CLAIM_CALL_HOURS.from && hour < CLAIM_CALL_HOURS.until;
}

/** A code to be read out: "1 2 3, 4 5 6", so it's spoken digit by digit with a pause. */
export const spokenCode = (code: string) =>
  `${code.slice(0, 3).split("").join(" ")}, ${code.slice(3).split("").join(" ")}`;

/** Wrong codes a claim takes before it stops taking them (the claimant starts again). */
export const CLAIM_CODE_ATTEMPTS = 5;

// ---------- Finding a salon that's already listed (D-22) ----------

/** Words too common in salon names to tell two apart. */
const COMMON_NAME_WORDS = new Set([
  "the",
  "and",
  "a",
  "of",
  "by",
  "on",
  "at",
  "co",
  "salon",
  "salons",
  "hair",
  "hairdressing",
  "hairdresser",
  "hairdressers",
  "beauty",
  "studio",
  "studios",
  "bar",
  "barber",
  "barbers",
  "barbershop",
  "spa",
  "lounge",
  "house",
  "room",
  "boutique",
  "nails",
  "nail",
  "lash",
  "lashes",
  "brow",
  "brows",
  "skin",
  "clinic",
  "design",
  "designs",
  "pty",
  "ltd",
]);

/** A salon name's words, lowercased, without accents, punctuation or "&". */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words that tell a salon's name apart (the common ones dropped, unless that's all it has). */
export function distinctiveWords(name: string): string[] {
  const words = nameWords(name);
  const distinctive = words.filter((w) => !COMMON_NAME_WORDS.has(w) && w.length > 1);
  return distinctive.length > 0 ? distinctive : words;
}

/**
 * How alike a name someone typed is to a listing's, from 0 to 1: 1 for the same words, then the
 * share of distinctive words they have in common (a word that starts the other counts, so "Bella"
 * finds "Bellas"). Below `NAME_MATCH_MIN` it isn't offered as a match.
 */
export function nameMatchScore(typed: string, listed: string): number {
  const a = nameWords(typed).join(" ");
  const b = nameWords(listed).join(" ");
  if (!a || !b) return 0;
  if (a === b) return 1;
  const typedWords = distinctiveWords(typed);
  const listedWords = distinctiveWords(listed);
  const alike = (x: string, y: string) =>
    x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
  const shared = typedWords.filter((w) => listedWords.some((l) => alike(w, l))).length;
  if (shared === 0) return 0;
  // Shared over the longer list: "Bella" vs "Bella Rosa Hair" is a partial match.
  return (0.9 * shared) / Math.max(typedWords.length, listedWords.length);
}

export const NAME_MATCH_MIN = 0.3;

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

// ---------- Conversations (D-17, D-19) ----------

export type MessageBlocker = "salon_suspended" | "wait_for_salon" | "not_taking_messages";

/**
 * Why one side can't write in their conversation right now, or null if they can (D-19). The job
 * seeker replies once the salon has written; the salon writes to people who applied to it, or who
 * take messages (`salonAccessTo`). Cold messages have daily limits (`contactLimitReached`),
 * checked when sending.
 */
export function messageBlockerOf(input: {
  side: "salon" | "seeker";
  salonActive: boolean;
  salonHasWritten: boolean;
  /** For the salon: whether this person may be written to (`SalonAccess.message`). */
  takesMessages?: boolean;
}): MessageBlocker | null {
  if (!input.salonActive) return "salon_suspended";
  if (input.side === "salon" && input.takesMessages === false) return "not_taking_messages";
  if (input.side === "seeker" && !input.salonHasWritten) return "wait_for_salon";
  return null;
}

/** A quick reply with the applicant's first name, the job and the salon filled in. */
export function fillQuickReply(
  text: string,
  values: { firstName: string; job: string; salon: string },
): string {
  return text
    .replaceAll("{firstName}", values.firstName.trim() || "there")
    .replaceAll("{job}", values.job.trim())
    .replaceAll("{salon}", values.salon.trim());
}

// ---------- Text people typed, in emails we send ----------

const LINK =
  /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|info|biz|io|co|au|nz|uk|me|ly|xyz|app|link|site|online|shop|top)\b(?:\/\S*)?/gi;

/**
 * A name someone typed (a salon, a person, a job title), made safe to put in the subject or
 * heading of an email to somebody else: one line, no control characters, and no web addresses,
 * so our emails can't be made to carry a link of the sender's choosing.
 */
export function plainLine(text: string): string {
  return text
    .replace(/[\p{Cc}\u2028\u2029]+/gu, " ")
    .replace(LINK, "")
    .replace(/\s+/g, " ")
    .trim();
}
