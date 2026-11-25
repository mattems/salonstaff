import { describe, expect, it } from "vitest";
import {
  claimMethods,
  eligibilityOf,
  entitlementOf,
  isValidAbn,
  maskEmail,
  nameMatches,
  verificationLevel,
} from "./rules";

const now = new Date("2026-12-01T00:00:00Z");
const day = 86_400_000;
const salon = {
  status: "active" as const,
  freeUntil: null as Date | null,
  subscriptionStatus: null as string | null,
  subscriptionCurrentPeriodEnd: null as Date | null,
  listingCredits: 0,
};

describe("entitlementOf", () => {
  it.each([
    [
      { ...salon, freeUntil: new Date(now.getTime() + day) },
      { ok: true, via: "free_period" },
    ],
    [
      { ...salon, freeUntil: new Date(now.getTime() - day), subscriptionStatus: "active" },
      { ok: true, via: "subscription" },
    ],
    [
      {
        ...salon,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodEnd: new Date(now.getTime() - day),
        listingCredits: 1,
      },
      { ok: true, via: "credit" },
    ],
    [
      { ...salon, subscriptionStatus: "canceled" },
      { ok: false, reason: "needs_listing" },
    ],
    [
      { ...salon, status: "suspended" as const, listingCredits: 5 },
      { ok: false, reason: "suspended" },
    ],
  ])("%#", (input, expected) => expect(entitlementOf(input, now)).toEqual(expected));
});

describe("eligibilityOf", () => {
  const ready = {
    signedIn: true,
    role: "seeker" as const,
    hasProfile: true,
    identity: "verified" as const,
    qualification: "not_started" as const,
    alreadyApplied: false,
    requireQualification: false,
  };
  it.each([
    [{ ...ready, signedIn: false }, "login"],
    [{ ...ready, role: "employer" as const }, "employer"],
    [{ ...ready, alreadyApplied: true }, "applied"],
    [{ ...ready, hasProfile: false }, "profile"],
    [{ ...ready, identity: "pending" as const }, "verify"],
    [{ ...ready, requireQualification: true }, "qualification"],
  ])("blocks with %s", (input, blocker) =>
    expect(eligibilityOf(input)).toMatchObject({ canApply: false, blocker }),
  );

  it("lets a verified, profiled seeker apply", () => {
    expect(eligibilityOf(ready)).toEqual({ canApply: true });
    expect(
      eligibilityOf({ ...ready, requireQualification: true, qualification: "verified" }),
    ).toEqual({ canApply: true });
  });
});

describe("verification", () => {
  it("levels", () => {
    expect(verificationLevel("pending", "verified")).toBe(0);
    expect(verificationLevel("verified", "pending")).toBe(1);
    expect(verificationLevel("verified", "verified")).toBe(2);
  });

  it.each([
    [{ firstName: "Sam", lastName: "Lee" }, { firstName: "Samantha", lastName: "LEE" }, true],
    [{ firstName: "José", lastName: "O'Neil" }, { firstName: "Jose", lastName: "ONeil" }, true],
    [{ firstName: "Sam", lastName: "Lee" }, { firstName: "Sam", lastName: "Li" }, false],
    [{ firstName: "Sam", lastName: "Lee" }, { firstName: null, lastName: "Lee" }, false],
  ])("nameMatches %j %j", (profile, id, match) => expect(nameMatches(profile, id)).toBe(match));
});

it("ABN checksum", () => {
  expect(isValidAbn("51 824 753 556")).toBe(true);
  expect(isValidAbn("12 345 678 901")).toBe(false);
  expect(isValidAbn("5182475355")).toBe(false);
});

it("claims", () => {
  expect(maskEmail("hello@salon.com")).toBe("he•••@salon.com");
  expect(claimMethods({ email: "a@b.co" })).toEqual(["email", "review"]);
  expect(claimMethods({ email: null })).toEqual(["review"]);
});
