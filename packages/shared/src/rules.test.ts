import { describe, expect, it } from "vitest";
import { CONTACT_LIMITS } from "./constants";
import { SHARE_CODE_RE, shareCode } from "./crypto";
import {
  abnNameMatches,
  boundingBox,
  claimMethods,
  contactLimitReached,
  distanceKm,
  distinctiveWords,
  eligibilityOf,
  entitlementOf,
  fillQuickReply,
  formatDistance,
  hourIn,
  isValidAbn,
  maskEmail,
  maskPhone,
  messageBlockerOf,
  NAME_MATCH_MIN,
  nameChangeExpiresIdentity,
  nameMatches,
  nameMatchScore,
  plainLine,
  profileIsStale,
  profileStrength,
  publicName,
  roughCoordinate,
  salonAbnStatus,
  salonAccessTo,
  shareLinkWorks,
  spokenCode,
  verificationLevel,
  withinCallingHours,
} from "./rules";
import { webAddress } from "./schemas";

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

describe("nameChangeExpiresIdentity", () => {
  const jess = { firstName: "Jess", lastName: "O'Brien" };
  it.each([
    [{ firstName: "Jess", lastName: "O'Brien" }, false],
    [{ firstName: "jess", lastName: "OBrien" }, false],
    [{ firstName: " Jéss ", lastName: "o'brien" }, false],
    [{ firstName: "Jessica", lastName: "O'Brien" }, true],
    [{ firstName: "Jess", lastName: "Smith" }, true],
    [{ firstName: "Sam", lastName: "Smith" }, true],
  ])("Jess O'Brien → %j: %s", (after, expires) =>
    expect(nameChangeExpiresIdentity(jess, after)).toBe(expires),
  );
});

it("ABN checksum", () => {
  expect(isValidAbn("51 824 753 556")).toBe(true);
  expect(isValidAbn("12 345 678 901")).toBe(false);
  expect(isValidAbn("5182475355")).toBe(false);
});

it("claims", () => {
  expect(maskEmail("hello@salon.com")).toBe("he•••@salon.com");
  expect(maskPhone("+61412345678")).toBe("04•• ••• 678");
  expect(maskPhone("0412 345 678")).toBe("04•• ••• 678");
  expect(claimMethods({ email: "a@b.co", phone: null })).toEqual(["email", "review"]);
  expect(claimMethods({ email: null, phone: null })).toEqual(["review"]);
  // A mobile takes an SMS; a landline doesn't.
  // A mobile can take a text or a call.
  expect(claimMethods({ email: "a@b.co", phone: "0412 345 678" })).toEqual([
    "email",
    "phone",
    "call",
    "review",
  ]);
  // A landline gets a call that reads out the code.
  expect(claimMethods({ email: null, phone: "(07) 3000 1111" })).toEqual(["call", "review"]);
  expect(claimMethods({ email: null, phone: "+61 2 9000 1234" })).toEqual(["call", "review"]);
  // A 1300 or 13 number is routed (often to a menu): neither.
  expect(claimMethods({ email: null, phone: "1300 123 456" })).toEqual(["review"]);
  expect(claimMethods({ email: null, phone: "13 12 34" })).toEqual(["review"]);

  expect(maskPhone("+61730001111")).toBe("07•• ••• 111");
  expect(spokenCode("123456")).toBe("1 2 3, 4 5 6");
});

describe("calling hours, the salon's own time", () => {
  // 2026-07-01 22:30 UTC: 8:30am in Sydney and Brisbane (no daylight saving in July), 8am in
  // Adelaide, 6:30am in Perth.
  const morning = new Date("2026-07-01T22:30:00Z");
  it.each([
    ["NSW", 8, true],
    ["QLD", 8, true],
    ["SA", 8, true],
    ["NT", 8, true],
    ["WA", 6, false],
  ] as const)("%s is at hour %i", (state, hour, ok) => {
    expect(hourIn(state, morning)).toBe(hour);
    expect(withinCallingHours(state, morning)).toBe(ok);
  });

  it("stops at 8pm, and follows daylight saving", () => {
    // 2026-12-01 09:00 UTC: 8pm in Sydney (daylight saving), 7pm in Brisbane (none).
    const evening = new Date("2026-12-01T09:00:00Z");
    expect(withinCallingHours("NSW", evening)).toBe(false);
    expect(withinCallingHours("QLD", evening)).toBe(true);
  });
});

describe("finding a listed salon by name", () => {
  it.each([
    ["Bella Rosa Hair", "Bella Rosa Hair", 1],
    ["bella rosa hair", "Bella Rosa Hair!", 1],
    ["Smith & Co", "Smith and Co", 1],
    ["Café Noir", "Cafe Noir", 1],
  ])("%s is %s", (typed, listed, score) => {
    expect(nameMatchScore(typed, listed)).toBe(score);
  });

  it("scores shared distinctive words, ignoring the common ones", () => {
    expect(nameMatchScore("Bella Rosa", "Bella Rosa Hair Studio")).toBeCloseTo(0.9);
    expect(nameMatchScore("Bella", "Bella Rosa Hair")).toBeCloseTo(0.45);
    expect(nameMatchScore("Bellas", "Bella Hair")).toBeCloseTo(0.9);
    // Only common words in common: no match.
    expect(nameMatchScore("The Hair Studio", "Hair Studio Fitzroy")).toBe(0);
    expect(nameMatchScore("Fade Room", "Bella Rosa")).toBe(0);
    expect(nameMatchScore("", "Bella")).toBe(0);
  });

  it("keeps the common words when a name is only those", () => {
    expect(distinctiveWords("The Hair Studio")).toEqual(["the", "hair", "studio"]);
    expect(distinctiveWords("Studio 54 Hair")).toEqual(["54"]);
    expect(nameMatchScore("Hair Studio", "The Hair Studio")).toBeGreaterThanOrEqual(NAME_MATCH_MIN);
  });
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
    ["phone only, but applied here", { ...base, contactBy: "phone" as const, applied: true }, all],
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
    [{ kind: "message", cold: true, salonColdToday: 0, personToday: 0 }, null],
    [{ kind: "message", cold: true, salonColdToday: 3, personToday: 1 }, "same_person"],
    [
      { kind: "message", cold: true, salonColdToday: messagesPerDay, personToday: 0 },
      "salon_messages",
    ],
    [{ kind: "message", cold: false, salonColdToday: messagesPerDay, personToday: 9 }, null],
    [{ kind: "phone", salonToday: phoneRevealsPerDay - 1 }, null],
    [{ kind: "phone", salonToday: phoneRevealsPerDay }, "salon_reveals"],
    // The person's own count, across every salon they're on, runs out too.
    [{ kind: "phone", salonToday: 0, senderToday: phoneRevealsPerDay }, "salon_reveals"],
    [
      {
        kind: "message",
        cold: true,
        salonColdToday: 0,
        personToday: 0,
        senderColdToday: messagesPerDay,
      },
      "salon_messages",
    ],
  ] as const)("%o → %s", (input, expected) => {
    expect(contactLimitReached(input)).toBe(expected);
  });
});

describe("messageBlockerOf", () => {
  const ok = { salonActive: true, salonHasWritten: true };
  it.each([
    ["salon", ok, null],
    ["salon", { ...ok, salonHasWritten: false }, null],
    ["seeker", ok, null],
    ["seeker", { ...ok, salonHasWritten: false }, "wait_for_salon"],
    ["salon", { ...ok, salonActive: false }, "salon_suspended"],
    ["seeker", { ...ok, salonActive: false }, "salon_suspended"],
    ["salon", { ...ok, takesMessages: false }, "not_taking_messages"],
    ["seeker", { ...ok, takesMessages: false }, null],
  ] as const)("%s %j → %s", (side, input, blocker) =>
    expect(messageBlockerOf({ side, ...input })).toBe(blocker),
  );
});

it("fillQuickReply", () => {
  expect(
    fillQuickReply("Hi {firstName}, about {job}. {salon}", {
      firstName: "Jess",
      job: "Senior Colourist",
      salon: "Willow & Ash",
    }),
  ).toBe("Hi Jess, about Senior Colourist. Willow & Ash");
  expect(fillQuickReply("Hi {firstName}", { firstName: " ", job: "", salon: "" })).toBe("Hi there");
});

describe("abnNameMatches", () => {
  it.each([
    ["The Fade Room", ["FADE ROOM PTY LTD"], true],
    ["Fade Room", ["SMITH, JANE", "The Fade Room Fitzroy"], true],
    // Words added to the registered name aren't vouched for by it.
    ["Fade Room Fitzroy", ["SMITH, JANE", "The Fade Room"], false],
    ["Toni & Guy Hair Studio Bondi", ["HAIR STUDIO"], false],
    ["Jane Smith", ["SMITH, JANE"], true],
    ["Jane Smith Hair", ["SMITH, JANE"], false],
    ["Toni & Guy Bondi", ["FADE ROOM PTY LTD", "The Fade Room"], false],
    ["Toni and Guy", ["TONI & GUY"], true],
    // Too little to go on.
    ["Co", ["CO PTY LTD"], false],
    ["Fade Room", [], false],
  ] as const)("%s against %o → %s", (name, registered, expected) => {
    expect(abnNameMatches(name, registered)).toBe(expected);
  });
});

describe("salonAbnStatus", () => {
  const base = { salonName: "Fade Room", registeredNames: ["Fade Room Pty Ltd"] };
  it.each([
    [{ ...base, register: "verified", ownsVerifiedSalonWithAbn: false }, "verified"],
    // An active ABN under another name waits for staff: ABNs are public.
    [
      { ...base, salonName: "Toni & Guy", register: "verified", ownsVerifiedSalonWithAbn: false },
      "pending",
    ],
    // Another location of a salon they already own, verified.
    [
      { ...base, salonName: "Other Name", register: "verified", ownsVerifiedSalonWithAbn: true },
      "verified",
    ],
    [{ ...base, register: "failed", ownsVerifiedSalonWithAbn: true }, "failed"],
    [{ ...base, register: "pending", ownsVerifiedSalonWithAbn: false }, "pending"],
  ] as const)("%o → %s", (input, expected) => {
    expect(salonAbnStatus(input)).toBe(expected);
  });
});

describe("plainLine", () => {
  it.each([
    ["The Fade Room", "The Fade Room"],
    ["Security alert\r\nBcc: x@y.z", "Security alert Bcc: x@y.z"],
    ["Confirm at https://evil.example/login now", "Confirm at now"],
    ["Verify: www.evil.example", "Verify:"],
    ["Go to evil-site.com/reset today", "Go to today"],
    ["Hair & Co.", "Hair & Co."],
  ])("%j → %j", (input, expected) => {
    expect(plainLine(input)).toBe(expected);
  });
});

describe("webAddress", () => {
  it.each([
    ["fade.com.au", "https://fade.com.au"],
    ["https://fade.com.au/book?x=1", "https://fade.com.au/book?x=1"],
    ["http://fade.com.au", "http://fade.com.au"],
    ["javascript:alert(1)", null],
    ["data:text/html,<script>", null],
    ["https://user:pass@fade.com.au", null],
    ["localhost", null],
    ["", null],
  ])("%j → %j", (input, expected) => {
    expect(webAddress(input)).toBe(expected);
  });
});

describe("profileStrength", () => {
  const empty = {
    photoUrl: null,
    headline: null,
    about: null,
    specialties: [],
    availableDays: [],
    employmentTypes: [],
    payMin: null,
    portfolio: 0,
    experience: 0,
    endorsements: 0,
    identityVerified: false,
  };
  const full = {
    photoUrl: "https://media/x.jpg",
    headline: "Colourist",
    about: "Ten years of blondes",
    specialties: ["Balayage"],
    availableDays: ["mon"],
    employmentTypes: [],
    payMin: 35,
    portfolio: 3,
    experience: 1,
    endorsements: 1,
    identityVerified: true,
  };

  it("counts only the basics for a new profile, and suggests the portfolio first", () => {
    const { score, missing } = profileStrength(empty);
    expect(score).toBe(20);
    expect(missing[0]?.part).toBe("portfolio");
    expect(missing).toHaveLength(9);
  });

  it("is 100 with everything, with nothing missing", () => {
    expect(profileStrength(full)).toEqual({ score: 100, missing: [] });
  });

  it.each([
    ["two portfolio photos aren't enough", { portfolio: 2 }, "portfolio", 85],
    ["a headline without an about isn't enough", { about: "  " }, "about", 90],
    [
      "either days or kinds of work count as availability",
      { availableDays: [], employmentTypes: ["casual"] },
      null,
      100,
    ],
    ["pay of 0 isn't possible, null is not saying", { payMin: null }, "pay", 95],
  ] as const)("%s", (_, change, missingPart, score) => {
    const result = profileStrength({ ...full, ...change });
    expect(result.score).toBe(score);
    expect(result.missing.map((m) => m.part)).toEqual(missingPart ? [missingPart] : []);
  });
});

describe("profileIsStale", () => {
  const now = new Date("2026-11-28T00:00:00Z");
  it.each([
    ["2026-11-27T00:00:00Z", false],
    ["2026-08-30T00:00:00Z", false],
    ["2026-08-29T23:00:00Z", true],
    ["2025-01-01T00:00:00Z", true],
  ])("updated %s → %s", (updatedAt, stale) => {
    expect(profileIsStale(updatedAt, now)).toBe(stale);
  });
});
