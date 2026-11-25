import { describe, expect, it } from "vitest";
import { verificationReference } from "./crypto";
import { educationSchema, jobInputSchema } from "./schemas";

describe("verificationReference", () => {
  it("looks like SSV-XXXX-XXXX with no look-alike characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const ref = verificationReference();
      expect(ref).toMatch(/^SSV-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      seen.add(ref);
    }
    expect(seen.size).toBe(200);
  });
});

describe("optional numbers from forms", () => {
  it.each([
    ["", undefined],
    [null, undefined],
    [undefined, undefined],
    ["2019", 2019],
    [2019, 2019],
  ])("reads %j as %j", (year, expected) => {
    const parsed = educationSchema.parse({ qualification: "Cert III", institution: "TAFE", year });
    expect(parsed.year).toBe(expected);
  });

  it("refuses a number out of range instead of dropping it", () => {
    expect(
      educationSchema.safeParse({ qualification: "A", institution: "B", year: 1800 }).success,
    ).toBe(false);
    const job = {
      title: "Senior Stylist",
      role: "stylist",
      employmentType: "full_time",
      suburb: "Newtown",
      state: "NSW",
      postcode: "2042",
      description: "A long enough description of a lovely job at a lovely salon.",
    };
    expect(jobInputSchema.safeParse({ ...job, payMin: "abc" }).success).toBe(false);
    expect(jobInputSchema.parse({ ...job, payMin: "", payMax: "40" })).toMatchObject({
      payMax: 40,
    });
    expect(jobInputSchema.parse({ ...job, payMin: "" }).payMin).toBeUndefined();
  });
});
