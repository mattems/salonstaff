import { salonScope } from "@salonstaff/db";
import { decodeId } from "@salonstaff/shared";
import { describe, expect, it } from "vitest";
import { salonOwner, uid } from "./fixtures";
import { createTestApp, withDb } from "./helpers";

const SECRET = "whsec_test_secret_for_signatures";
const STRIPE = { STRIPE_SECRET_KEY: "sk_test_not_a_real_key", STRIPE_WEBHOOK_SECRET: SECRET };

/** Signs a webhook body the way Stripe does (`t=…,v1=HMAC-SHA256(secret, "t.body")`). */
async function stripeSignature(body: string, secret = SECRET) {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

const event = (type: string, object: Record<string, unknown>) =>
  JSON.stringify({
    id: `evt_${uid()}`,
    object: "event",
    type,
    data: { object },
    api_version: "2025-01-01",
    created: 0,
    livemode: false,
  });

describe("billing", () => {
  it("shows the salon its terms", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const billing = await owner.api<{
      billingOn: boolean;
      entitlement: { via: string };
      prices: { singleListingCents: number; planMonthlyCents: number };
      subscription: unknown;
    }>("GET", owner.at("/billing"));
    expect(billing.status).toBe(200);
    expect(billing.body).toMatchObject({
      billingOn: true,
      entitlement: { via: "free_period" },
      subscription: null,
    });
    expect(billing.body.prices.singleListingCents).toBe(4900);
    // Off locally, there's no Stripe portal.
    expect((await owner.api("POST", owner.at("/billing/portal"))).status).toBe(404);
  });

  it("only accepts webhooks Stripe signed, and fulfils a checkout once", async () => {
    const off = createTestApp();
    expect((await off.call("/v1/webhooks/stripe", { method: "POST", body: "{}" })).status).toBe(
      404,
    );

    const app = createTestApp({ env: STRIPE });
    const { owner, salon } = await salonOwner(app);
    const salonId = decodeId("salon", salon.id) as string;
    const ref = `cs_test_${uid()}`;
    await withDb((db) =>
      salonScope(db, salonId).startPayment(
        { kind: "single_listing", amountCents: 4900, provider: "stripe", checkoutRef: ref },
        { type: "system" },
      ),
    );

    const body = event("checkout.session.completed", {
      id: ref,
      object: "checkout.session",
      subscription: null,
    });
    const forged = await app.call("/v1/webhooks/stripe", {
      method: "POST",
      headers: { "Stripe-Signature": await stripeSignature(body, "whsec_someone_else") },
      body,
    });
    expect(forged.status).toBe(400);

    for (let i = 0; i < 2; i++) {
      const delivered = await app.call("/v1/webhooks/stripe", {
        method: "POST",
        headers: { "Stripe-Signature": await stripeSignature(body) },
        body,
      });
      expect(delivered.status).toBe(200);
    }
    const billing = await owner.api<{ listingCredits: number }>("GET", owner.at("/billing"));
    expect(billing.body.listingCredits).toBe(1);
  });
});
