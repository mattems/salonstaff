import { describe, expect, it } from "vitest";
import { describeChange, formatMoney, formatRelative, humanize } from "./format";

describe("relative times", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  it.each([
    ["2026-10-01T11:59:40Z", "just now"],
    ["2026-10-01T11:48:00Z", "12 minutes ago"],
    ["2026-09-29T12:00:00Z", "2 days ago"],
  ])("%s → %s", (iso, expected) => {
    expect(formatRelative(iso, now)).toBe(expected);
  });
});

describe("money and words", () => {
  it("shows cents as Australian dollars", () => {
    expect(formatMoney(4900)).toBe("$49.00");
  });
  it("turns codes into words", () => {
    expect(humanize("pending_review")).toBe("Pending review");
    expect(humanize(null)).toBe("–");
  });
});

describe("audit details", () => {
  it.each([
    [
      { action: "user.role_changed", before: { role: "seeker" }, after: { role: "employer" } },
      "seeker → employer",
    ],
    [
      { action: "salon.credits_changed", before: { credits: 1 }, after: { credits: 4, delta: 3 } },
      "+3 (1 → 4)",
    ],
    [{ action: "user.banned", before: null, after: { sessions_ended: 2 } }, "2 sessions ended"],
    [
      { action: "directory.imported", before: null, after: { added: 5, duplicates: 1, errors: 0 } },
      "5 added, 1 duplicates, 0 errors",
    ],
    [{ action: "something.else", before: null, after: null }, ""],
  ])("%o", (event, expected) => {
    expect(describeChange(event)).toBe(expected);
  });
});
