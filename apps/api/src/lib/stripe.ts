/**
 * Everything the API asks of Stripe: Checkout and the billing portal (when `BILLING=on`),
 * Stripe Identity, and webhook signatures. Nothing else imports the Stripe SDK.
 */
import Stripe from "stripe";
import type { Env } from "../env";
import { ConfigurationError } from "./auth-config";

export type StripeEvent = Stripe.Event;

/** Billing takes real payments only when switched on and given a key. */
export const billingOn = (env: Env) => env.BILLING === "on" && Boolean(env.STRIPE_SECRET_KEY);

function client(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new ConfigurationError("STRIPE_SECRET_KEY is not set on this Worker.");
  }
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
}

// ---------- Stripe Identity ----------

/** A document check with a live selfie. Stripe shows the person its own pages. */
export async function createIdentitySession(
  env: Env,
  input: { userId: string; email: string | null; returnUrl: string },
): Promise<{ id: string; url: string }> {
  const session = await client(env).identity.verificationSessions.create({
    type: "document",
    options: {
      document: {
        allowed_types: ["driving_license", "passport", "id_card"],
        require_live_capture: true,
        require_matching_selfie: true,
      },
    },
    ...(input.email ? { provided_details: { email: input.email } } : {}),
    metadata: { userId: input.userId },
    return_url: input.returnUrl,
  });
  if (!session.url) throw new Error("Stripe Identity returned no URL for the session");
  return { id: session.id, url: session.url };
}

/** The name Stripe read from the ID, to compare with the profile (and then forget). */
export async function identityName(
  env: Env,
  sessionId: string,
): Promise<{ firstName: string | null; lastName: string | null }> {
  const session = await client(env).identity.verificationSessions.retrieve(sessionId, {
    expand: ["verified_outputs"],
  });
  return {
    firstName: session.verified_outputs?.first_name ?? null,
    lastName: session.verified_outputs?.last_name ?? null,
  };
}

/** Asks Stripe to delete the ID images, selfie and extracted details (D-03). */
export async function redactIdentitySession(env: Env, sessionId: string): Promise<void> {
  await client(env).identity.verificationSessions.redact(sessionId);
}

// ---------- Billing ----------

export async function createCustomer(
  env: Env,
  input: { name: string; salonId: string; abn: string | null },
): Promise<string> {
  const customer = await client(env).customers.create({
    name: input.name,
    metadata: { salonId: input.salonId, ...(input.abn ? { abn: input.abn } : {}) },
  });
  return customer.id;
}

/** Checkout with the price written in (AUD, GST included): a one-off listing, or the monthly plan. */
export async function createCheckout(
  env: Env,
  input: {
    customerId: string;
    kind: "single_listing" | "salon_plan";
    productName: string;
    amountCents: number;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ id: string; url: string }> {
  const plan = input.kind === "salon_plan";
  const session = await client(env).checkout.sessions.create({
    customer: input.customerId,
    mode: plan ? "subscription" : "payment",
    currency: "aud",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "aud",
          unit_amount: input.amountCents,
          tax_behavior: "inclusive",
          product_data: { name: input.productName },
          ...(plan ? { recurring: { interval: "month" as const } } : {}),
        },
      },
    ],
    metadata: input.metadata,
    ...(plan ? { subscription_data: { metadata: input.metadata } } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe Checkout returned no URL for the session");
  return { id: session.id, url: session.url };
}

export async function billingPortalUrl(env: Env, customerId: string, returnUrl: string) {
  const portal = await client(env).billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return portal.url;
}

/** When the subscription's current period ends (it's on the subscription's item). */
export async function subscriptionPeriodEnd(env: Env, subscriptionId: string) {
  const subscription = await client(env).subscriptions.retrieve(subscriptionId);
  return periodEndOf(subscription);
}

export function periodEndOf(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
}

// ---------- Webhooks ----------

/** The event, if Stripe signed it with our webhook secret; null otherwise. */
export async function verifiedEvent(
  env: Env,
  body: string,
  signature: string,
): Promise<StripeEvent | null> {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  try {
    return await client(env).webhooks.constructEventAsync(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return null;
  }
}

export type { Stripe };
