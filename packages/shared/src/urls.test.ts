import { describe, expect, it } from "vitest";
import {
  jobBaseSlug,
  jobPath,
  jobsLandingPath,
  nextFreeSlug,
  parseJobsPath,
  parseSalonsPath,
  ROLE_SLUGS,
  salonPath,
  slugify,
} from "./urls";

describe("slugify", () => {
  it.each([
    ["Willow & Ash Hair", "willow-and-ash-hair"],
    ["Senior Colourist — balayage!", "senior-colourist-balayage"],
    ["  Café Lumière  ", "cafe-lumiere"],
    ["Brow Theory's Studio", "brow-theorys-studio"],
  ])("%s → %s", (input, slug) => expect(slugify(input)).toBe(slug));
});

describe("paths", () => {
  it("builds job and salon paths", () => {
    const placed = {
      state: "NSW" as const,
      suburbSlug: "surry-hills",
      slug: jobBaseSlug("Senior Colourist", "Willow & Ash Hair"),
    };
    expect(jobPath(placed)).toBe("/jobs/nsw/surry-hills/senior-colourist-willow-and-ash-hair");
    expect(salonPath({ state: "VIC", suburbSlug: "fitzroy", slug: "the-fade-room" })).toBe(
      "/salons/vic/fitzroy/the-fade-room",
    );
  });

  it.each([
    [{}, "/jobs"],
    [{ state: "NSW" as const }, "/jobs/nsw"],
    [{ state: "NSW" as const, suburbSlug: "bondi" }, "/jobs/nsw/bondi"],
    [{ role: "stylist" as const }, "/jobs/hairdresser"],
    [
      { role: "barber" as const, state: "VIC" as const, suburbSlug: "fitzroy" },
      "/jobs/barber/vic/fitzroy",
    ],
  ])("landing %j → %s", (landing, path) => expect(jobsLandingPath(landing)).toBe(path));

  it("has unique role slugs that never look like a state", () => {
    const slugs = Object.values(ROLE_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs)
      expect(["nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt"]).not.toContain(s);
  });
});

describe("parseJobsPath", () => {
  it.each([
    [[], { kind: "landing" }],
    [["nsw"], { kind: "landing", state: "NSW" }],
    [["nsw", "surry-hills"], { kind: "landing", state: "NSW", suburbSlug: "surry-hills" }],
    [
      ["nsw", "surry-hills", "senior-colourist-willow"],
      { kind: "job", state: "NSW", suburbSlug: "surry-hills", slug: "senior-colourist-willow" },
    ],
    [["hairdresser"], { kind: "landing", role: "stylist" }],
    [["barber", "vic"], { kind: "landing", role: "barber", state: "VIC" }],
    [
      ["barber", "vic", "fitzroy"],
      { kind: "landing", role: "barber", state: "VIC", suburbSlug: "fitzroy" },
    ],
  ])("%j", (segments, route) => expect(parseJobsPath(segments)).toEqual(route));

  it.each([
    [["nowhere"]],
    [["barber", "fitzroy"]],
    [["nsw", "a", "b", "c"]],
    [["barber", "vic", "fitzroy", "x"]],
    [["NSW"]],
    [["nsw", "bad slug"]],
  ])("rejects %j", (segments) => expect(parseJobsPath(segments)).toBeNull());
});

describe("parseSalonsPath", () => {
  it("reads directory and salon pages", () => {
    expect(parseSalonsPath(["vic", "fitzroy", "the-fade-room"])).toEqual({
      kind: "salon",
      state: "VIC",
      suburbSlug: "fitzroy",
      slug: "the-fade-room",
    });
    expect(parseSalonsPath(["qld"])).toEqual({ kind: "landing", state: "QLD" });
    expect(parseSalonsPath(["barber"])).toBeNull();
  });
});

it("nextFreeSlug adds -2, -3 on a clash", () => {
  expect(nextFreeSlug("barber", new Set())).toBe("barber");
  expect(nextFreeSlug("barber", new Set(["barber", "barber-2"]))).toBe("barber-3");
});
