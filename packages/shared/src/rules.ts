/**
 * The rules that decide things, as pure functions with table tests. Change a rule here and
 * nowhere else: the API, web app and admin portal all call these.
 */
import { PRICING, type VerificationStatus } from "./constants";

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
