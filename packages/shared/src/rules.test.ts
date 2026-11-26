import { describe, expect, it } from "vitest";
import { CONTACT_LIMITS } from "./constants";
import { SHARE_CODE_RE, shareCode } from "./crypto";
import {
  boundingBox,
  claimMethods,
  contactLimitReached,
  distanceKm,
  eligibilityOf,
  entitlementOf,
  formatDistance,
  isValidAbn,
  maskEmail,
  nameMatches,
  publicName,
  roughCoordinate,
  salonAccessTo,
  shareLinkWorks,
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

describe("near me", () => {
  const sydney = { latitude: -33.8688, longitude: 151.2093 };
  const melbourne = { latitude: -37.8136, longitude: 144.9631 };
  const parramatta = { latitude: -33.8151, longitude: 151.0011 };

  it.each([
    [sydney, sydney, 0],
    [sydney, parramatta, 20],
    [sydney, melbourne, 713],
  ])("distanceKm(%o, %o) is about %i km", (a, b, km) => {
    expect(Math.round(distanceKm(a, b))).toBe(km);
    expect(Math.round(distanceKm(b, a))).toBe(km);
  });

  it("boundingBox holds every point within the radius", () => {
    const box = boundingBox(sydney, 25);
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      // A point 24.9km away in each direction.
      const r = (bearing * Math.PI) / 180;
      const point = {
        latitude: sydney.latitude + (24.9 / 111.2) * Math.cos(r),
        longitude:
          sydney.longitude +
          (24.9 / (111.2 * Math.cos((sydney.latitude * Math.PI) / 180))) * Math.sin(r),
      };
      expect(distanceKm(sydney, point)).toBeLessThan(25);
      expect(point.latitude).toBeGreaterThanOrEqual(box.south);
      expect(point.latitude).toBeLessThanOrEqual(box.north);
      expect(point.longitude).toBeGreaterThanOrEqual(box.west);
      expect(point.longitude).toBeLessThanOrEqual(box.east);
    }
    expect(box.north - box.south).toBeCloseTo(0.45, 2);
  });

  it.each([
    [-33.868812, -33.87],
    [151.20931, 151.21],
    [0.004, 0],
  ])("roughCoordinate(%d) is %d", (input, expected) => {
    expect(roughCoordinate(input)).toBe(expected);
  });

  it.each([
    [0.02, "100m"],
    [0.84, "800m"],
    [1, "1km"],
    [12.4, "12km"],
  ])("formatDistance(%d) is %s", (km, text) => {
    expect(formatDistance(km)).toBe(text);
  });
});

describe("salonAccessTo", () => {
  const base = {
    visibility: "salons" as const,
    applied: false,
    hiddenFromSalon: false,
    contactBy: "both" as const,
    hasEmail: true,
    hasMobile: true,
  };
  const all = { view: true, message: true, phone: true };
  const none = { view: false, message: false, phone: false };
  it.each([
    ["salons only", base, all],
    ["public", { ...base, visibility: "public" as const }, all],
    ["hidden", { ...base, visibility: "hidden" as const }, none],
    ["hidden, but applied here", { ...base, visibility: "hidden" as const, applied: true }, all],
    ["hidden from this salon", { ...base, hiddenFromSalon: true }, none],
    ["hidden from this salon, but applied", { ...base, hiddenFromSalon: true, applied: true }, all],
    ["email only", { ...base, contactBy: "email" as const }, { ...all, phone: false }],
    ["phone only", { ...base, contactBy: "phone" as const }, { ...all, message: false }],
    ["no email to send to", { ...base, hasEmail: false }, { ...all, message: false }],
    ["no mobile to show", { ...base, hasMobile: false }, { ...all, phone: false }],
  ])("%s", (_label, input, expected) => {
    expect(salonAccessTo(input)).toEqual(expected);
  });
});

describe("share links", () => {
  it.each([
    ["public", true],
    ["salons", false],
    ["hidden", false],
  ] as const)("work when %s: %s", (visibility, works) => {
    expect(shareLinkWorks(visibility)).toBe(works);
  });

  it("makes unguessable codes from unmistakable characters", () => {
    const codes = new Set(Array.from({ length: 200 }, shareCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(SHARE_CODE_RE);
  });

  it.each([
    ["Jess", "Taylor", "Jess T."],
    [" Jess ", "taylor", "Jess T."],
    ["Jess", "", "Jess"],
  ])("names %s %s as %s", (first, last, expected) => {
    expect(publicName(first, last)).toBe(expected);
  });
});

describe("contactLimitReached", () => {
  const { messagesPerDay, phoneRevealsPerDay } = CONTACT_LIMITS;
  it.each([
    [{ kind: "message", salonToday: 0, personToday: 0 }, null],
    [{ kind: "message", salonToday: 3, personToday: 1 }, "same_person"],
    [{ kind: "message", salonToday: messagesPerDay, personToday: 0 }, "salon_messages"],
    [{ kind: "phone", salonToday: phoneRevealsPerDay - 1, personToday: 5 }, null],
    [{ kind: "phone", salonToday: phoneRevealsPerDay, personToday: 0 }, "salon_reveals"],
  ] as const)("%o → %s", (input, expected) => {
    expect(contactLimitReached(input)).toBe(expected);
  });
});
