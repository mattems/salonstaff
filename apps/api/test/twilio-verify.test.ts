/**
 * Codes by Twilio Verify (D-23): sign-in and claims, and the local rule that real texts and calls
 * only go to your own numbers (`TWILIO_LOCAL_ALLOW`).
 */
import { salonsFor } from "@salonstaff/db";
import { ApiError, encodeId } from "@salonstaff/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { mayReach } from "../src/lib/verify";
import { randomAbn, testSuburb, uid } from "./fixtures";
import { codeFor, createTestApp, fakeVerify, withDb } from "./helpers";

const testMobile = () => `+614${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const testLandline = () => `+617${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://localhost:5300" },
  body: JSON.stringify(body),
});

async function listing(phone: string) {
  return withDb((db) =>
    salonsFor(db).addListing(
      {
        name: `Listing ${uid()}`,
        suburb: testSuburb(),
        state: "QLD",
        postcode: "4005",
        abn: randomAbn(),
        email: null,
        phone,
      },
      { type: "system" },
    ),
  );
}

interface Claim {
  id: string;
  status: string;
  via: string | null;
  codeExpiresAt: string | null;
  createdAt: string;
}

const claimBody = (method: "phone" | "call") => ({
  contactName: "Clare Claimant",
  phone: "0412000111",
  method,
});

describe("which numbers a real text or call may go to", () => {
  const env = (ENVIRONMENT: "local" | undefined, allow?: string) =>
    ({ ENVIRONMENT, TWILIO_LOCAL_ALLOW: allow }) as Env;
  it("deployed, any; locally, only the allowed ones", () => {
    expect(mayReach(env(undefined), "+61412345678")).toBe(true);
    expect(mayReach(env("local"), "+61412345678")).toBe(false);
    expect(mayReach(env("local", "+61 412 345 678, +61730001111"), "+61412345678")).toBe(true);
    expect(mayReach(env("local", "+61730001111"), "+61412345678")).toBe(false);
  });
});

describe("signing in with a Verify code", () => {
  it("sends and checks the code through Verify, only to allowed numbers locally", async () => {
    const phoneNumber = testMobile();
    const fake = fakeVerify();
    const { call, sent } = createTestApp({
      phoneVerify: fake.verify,
      env: { TWILIO_LOCAL_ALLOW: phoneNumber },
    });
    expect((await call("/v1/auth/phone-number/send-otp", json({ phoneNumber }))).status).toBe(200);
    expect(fake.sent).toEqual([{ to: phoneNumber, channel: "sms" }]);
    // Twilio sent it, not us.
    expect(sent.some((m) => m.to.startsWith("sms+"))).toBe(false);

    const wrong = await call("/v1/auth/phone-number/verify", json({ phoneNumber, code: "000000" }));
    expect(wrong.status).toBe(400);
    const right = await call(
      "/v1/auth/phone-number/verify",
      json({ phoneNumber, code: fake.code }),
    );
    expect(right.status).toBe(200);
    expect(right.headers.getSetCookie().join(";")).toContain("session_token");

    // Someone else's number, locally: refused, and nothing sent.
    const other = testMobile();
    const refused = await call("/v1/auth/phone-number/send-otp", json({ phoneNumber: other }));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { detail: string }).detail).toContain("TWILIO_LOCAL_ALLOW");
    expect(fake.sent).toHaveLength(1);
  });

  it("says so when Twilio won't send", async () => {
    const phoneNumber = testMobile();
    const fake = fakeVerify({
      failWith: new ApiError("rate_limited", {
        detail: "Too many codes have been sent to that number",
        hint: "Wait.",
      }),
    });
    const { call } = createTestApp({
      phoneVerify: fake.verify,
      env: { TWILIO_LOCAL_ALLOW: phoneNumber },
    });
    const res = await call("/v1/auth/phone-number/send-otp", json({ phoneNumber }));
    expect(res.status).toBe(429);
  });
});

describe("claiming with a Verify code", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("texts the listing's mobile through Verify; the code lasts 10 minutes", async () => {
    const mobile = testMobile();
    const salon = await listing(mobile);
    const fake = fakeVerify();
    const app = createTestApp({ phoneVerify: fake.verify, env: { TWILIO_LOCAL_ALLOW: mobile } });
    const claimant = await app.person("Verified");
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${encodeId("salon", salon.id)}/claims`,
      claimBody("phone"),
    );
    expect(started.status).toBe(201);
    expect(started.body.via).toBe("phone");
    expect(fake.sent).toEqual([{ to: mobile, channel: "sms" }]);
    expect(app.sent.some((m) => m.to.startsWith("sms+"))).toBe(false);
    const lasts =
      Date.parse(started.body.codeExpiresAt as string) - Date.parse(started.body.createdAt);
    expect(Math.round(lasts / 60_000)).toBe(10);

    const wrong = await claimant.api<{ hint: string }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code: "000000" },
    );
    expect(wrong.status).toBe(400);
    expect(wrong.body.hint).toContain("4 more");
    const right = await claimant.api<{ claim: Claim }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code: fake.code },
    );
    expect(right.body.claim.status).toBe("approved");
  });

  it("calls the listing's landline through Verify", async () => {
    const landline = testLandline();
    const salon = await listing(landline);
    const fake = fakeVerify();
    const app = createTestApp({ phoneVerify: fake.verify, env: { TWILIO_LOCAL_ALLOW: landline } });
    const claimant = await app.person("Rung");
    // Midday in Brisbane.
    const noon = new Date();
    noon.setUTCHours(2, 0, 0, 0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(noon);
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${encodeId("salon", salon.id)}/claims`,
      claimBody("call"),
    );
    expect(started.status).toBe(201);
    expect(fake.sent).toEqual([{ to: landline, channel: "call" }]);
    const right = await claimant.api<{ claim: Claim }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code: fake.code },
    );
    expect(right.body.claim.status).toBe("approved");
  });

  it("calls a listing's mobile too, when that's asked for", async () => {
    const mobile = testMobile();
    const salon = await listing(mobile);
    const fake = fakeVerify();
    const app = createTestApp({ phoneVerify: fake.verify, env: { TWILIO_LOCAL_ALLOW: mobile } });
    const claimant = await app.person("RungMobile");
    const noon = new Date();
    noon.setUTCHours(2, 0, 0, 0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(noon);
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${encodeId("salon", salon.id)}/claims`,
      claimBody("call"),
    );
    expect(started.status).toBe(201);
    expect(started.body.via).toBe("call");
    expect(fake.sent).toEqual([{ to: mobile, channel: "call" }]);
    const right = await claimant.api<{ claim: Claim }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code: fake.code },
    );
    expect(right.body.claim.status).toBe("approved");
  });

  it("locally, a real salon's number gets our own code in Mailpit instead", async () => {
    const mobile = testMobile();
    const salon = await listing(mobile);
    const fake = fakeVerify();
    // Verify is set up, but this number isn't yours.
    const app = createTestApp({ phoneVerify: fake.verify });
    const claimant = await app.person("Careful");
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${encodeId("salon", salon.id)}/claims`,
      claimBody("phone"),
    );
    expect(started.status).toBe(201);
    expect(fake.sent).toEqual([]);
    const code = codeFor(app.sent, `sms+${mobile.slice(1)}@local.test`);
    const right = await claimant.api<{ claim: Claim }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code },
    );
    expect(right.body.claim.status).toBe("approved");
  });

  it("closes the claim when Twilio won't send, so it can be started again at once", async () => {
    const mobile = testMobile();
    const salon = await listing(mobile);
    const twilio: { failWith?: Error } = {
      failWith: new ApiError("validation_failed", {
        detail: "We couldn't text that number",
        hint: "Check the number.",
      }),
    };
    const failing = fakeVerify(twilio);
    const env = { TWILIO_LOCAL_ALLOW: mobile };
    const app = createTestApp({ phoneVerify: failing.verify, env });
    const claimant = await app.person("Unlucky");
    const path = `/v1/salons/${encodeId("salon", salon.id)}/claims`;
    const refused = await claimant.api<{ detail: string }>("POST", path, claimBody("phone"));
    expect(refused.status).toBe(400);
    expect(refused.body.detail).toBe("We couldn't text that number");
    const mine = await claimant.api<{ status: string; decisionNote: string }>(
      "GET",
      `/v1/salons/${encodeId("salon", salon.id)}/claims/mine`,
    );
    expect(mine.body).toMatchObject({
      status: "rejected",
      decisionNote: "The code couldn't be sent",
    });

    // Twilio is back: no five-minute wait.
    delete twilio.failWith;
    const again = await claimant.api<Claim>("POST", path, claimBody("phone"));
    expect(again.status).toBe(201);
    expect(failing.sent).toEqual([{ to: mobile, channel: "sms" }]);
  });
});
