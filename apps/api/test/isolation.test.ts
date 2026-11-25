import { describe, expect, it } from "vitest";

/**
 * API code reaches the database through the scopes in packages/db (`publicSite`, `seeker`,
 * `salonScope`, `claims`, `checks`, `billing`, and `backOffice` behind the staff gate), never
 * through the table definitions. This reads the source to keep it that way.
 */
const sources = import.meta.glob<string>("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const files = Object.entries(sources).filter(([path]) => !path.endsWith(".test.ts"));
const using = (pattern: RegExp) =>
  files
    .filter(([, source]) => pattern.test(source))
    .map(([path]) => path)
    .sort();

/** Platform plumbing that owns its own table and no customer data. */
const MAY_USE_TABLES = ["../src/middleware/idempotency.ts"];

describe("data access boundaries", () => {
  it("reads the API's source", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("keeps table definitions out of API code", () => {
    expect(using(/\bschema\b[^"'\n]*from "@salonstaff\/db"|@salonstaff\/db\/schema/)).toEqual(
      MAY_USE_TABLES,
    );
  });

  it("writes no SQL outside packages/db", () => {
    expect(using(/from "drizzle-orm/)).toEqual(MAY_USE_TABLES);
  });

  it("keeps cross-account data access behind the staff gate", () => {
    expect(using(/\bbackOffice\b/)).toEqual(["../src/lib/staff-context.ts"]);
  });

  it("leaves the daily clean-up to the cron", () => {
    // `housekeeping(db)` works across every person; only the scheduled handler runs it.
    expect(using(/housekeeping as cleanUp/)).toEqual(["../src/lib/housekeeping.ts"]);
    expect(using(/from "\.\/lib\/housekeeping"/)).toEqual(["../src/index.ts"]);
  });

  it("talks to Stripe from one file", () => {
    expect(using(/from "stripe"/)).toEqual(["../src/lib/stripe.ts"]);
  });
});
