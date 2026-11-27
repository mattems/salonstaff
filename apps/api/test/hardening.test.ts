import { createAuth } from "@salonstaff/auth";
import { salonScope } from "@salonstaff/db";
import { CONTACT_LIMITS, decodeId, LIMITS } from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ALLOWED } from "../src/routes/auth";
import { salonInput, salonOwner, uid } from "./fixtures";
import { APP_ORIGIN, createTestApp, query, withDb } from "./helpers";

describe("the sign-in library's routes", () => {
  it("are all shut except the ones the website and app use, whatever it adds later", async () => {
    // Every route the library registers with our settings: a new one in an upgrade lands here.
    const paths = await withDb(async (db) => {
      const auth = createAuth({
        db,
        secret: "a-test-secret-that-is-long-enough-000",
        baseUrl: `${APP_ORIGIN}/api/v1/auth`,
        trustedOrigins: [APP_ORIGIN],
        environment: "local",
        sendEmailCode: async () => {},
        sendSmsCode: async () => {},
      });
      return Object.values(auth.api as Record<string, { path?: string }>)
        .map((endpoint) => endpoint.path)
        .filter((path): path is string => typeof path === "string");
    });
    expect(paths.length).toBeGreaterThan(20);
    const { call } = createTestApp();
    const shut = paths.filter(
      (path) => !ALLOWED.has(path) && !path.includes(":") && !path.startsWith("/callback"),
    );
    expect(shut).toContain("/email-otp/reset-password");
    for (const path of shut) {
      const response = await call(`/v1/auth${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
        body: "{}",
      });
      expect(response.status, path).toBe(404);
    }
  });
});

describe("limits on what one account can set off", () => {
  it("lets an account create only so many salons", async () => {
    const app = createTestApp();
    const person = await app.person("Chain", { role: "employer" });
    for (let i = 0; i < LIMITS.salonsPerAccount; i++) {
      expect((await person.api("POST", "/v1/employer/salons", salonInput())).status).toBe(201);
    }
    const over = await person.api("POST", "/v1/employer/salons", salonInput());
    expect(over.status).toBe(409);
  });

  it("doesn't let an unverified ABN stand for the business: its terms aren't the ABN's", async () => {
    const app = createTestApp();
    const { salon } = await salonOwner(app);
    const person = await app.person("Again", { role: "employer" });
    const again = await person.api<{ freeUntil: string; founding: boolean }>(
      "POST",
      "/v1/employer/salons",
      salonInput({ abn: (salon as unknown as { abn: string }).abn }),
    );
    expect(again.status).toBe(201);
    // No register lookup here, so neither ABN is verified: the first salon didn't use up the
    // ABN's free period for whoever really owns it.
    expect(again.body.freeUntil).not.toBe((salon as unknown as { freeUntil: string }).freeUntil);
    const given = await query(
      sql`select 1 from launch_terms where abn = ${(salon as unknown as { abn: string }).abn}`,
    );
    expect(given).toHaveLength(0);
  });

  it("lets a salon email only so many invites a day", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const invite = () =>
      owner.api("POST", owner.at("/team/invites"), {
        email: `invitee-${uid()}@example.test`,
        role: "manager",
      });
    for (let i = 0; i < CONTACT_LIMITS.invitesPerDay; i++)
      expect((await invite()).status).toBe(201);
    expect((await invite()).status).toBe(429);
  });

  it("keeps web addresses and line breaks out of an invite's subject", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app, {
      name: `Verify now at https://evil.example/login ${uid()}`,
    });
    const email = `target-${uid()}@example.test`;
    await owner.api("POST", owner.at("/team/invites"), { email, role: "manager" });
    const mail = app.sent.find((m) => m.to === email);
    expect(mail?.subject).toBeTruthy();
    expect(mail?.subject).not.toContain("evil.example");
  });
});

describe("a checkout that isn't paid yet", () => {
  const SECRET = "whsec_test_secret_for_signatures";
  const STRIPE = { STRIPE_SECRET_KEY: "sk_test_not_a_real_key", STRIPE_WEBHOOK_SECRET: SECRET };
  async function signed(type: string, object: Record<string, unknown>) {
    const body = JSON.stringify({
      id: `evt_${uid()}`,
      object: "event",
      type,
      data: { object },
      api_version: "2025-01-01",
      created: 0,
      livemode: false,
    });
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
    const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
    return { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${hex}` }, body };
  }

  it("grants nothing until the money arrives", async () => {
    const app = createTestApp({ env: STRIPE });
    const { owner, salon } = await salonOwner(app);
    const ref = `cs_test_${uid()}`;
    await withDb((db) =>
      salonScope(db, decodeId("salon", salon.id) as string).startPayment(
        { kind: "single_listing", amountCents: 4900, provider: "stripe", checkoutRef: ref },
        { type: "system" },
      ),
    );
    const session = { id: ref, object: "checkout.session", subscription: null };
    const credits = async () =>
      (await owner.api<{ listingCredits: number }>("GET", owner.at("/billing"))).body
        .listingCredits;

    const unpaid = await app.call(
      "/v1/webhooks/stripe",
      await signed("checkout.session.completed", { ...session, payment_status: "unpaid" }),
    );
    expect(unpaid.status).toBe(200);
    expect(await credits()).toBe(0);

    const paid = await app.call(
      "/v1/webhooks/stripe",
      await signed("checkout.session.async_payment_succeeded", {
        ...session,
        payment_status: "paid",
      }),
    );
    expect(paid.status).toBe(200);
    expect(await credits()).toBe(1);
  });
});
