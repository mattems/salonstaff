import { createRoute, z } from "@hono/zod-openapi";
import { billing, checks, type PaymentKind } from "@salonstaff/db";
import {
  ApiError,
  BRAND,
  encodeId,
  isSubscribed,
  PRICING,
  planPriceCents,
  randomBase62,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { isLocal } from "../lib/auth-config";
import { appUrl } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  EntitlementSchema,
  errors,
  json,
  jsonBody,
  SalonParams,
  UrlResponse,
} from "../lib/schemas";
import { requireSalon } from "../lib/session";
import {
  billingOn,
  billingPortalUrl,
  createCheckout,
  createCustomer,
  identityName,
  periodEndOf,
  redactIdentitySession,
  type StripeEvent,
  subscriptionPeriodEnd,
  verifiedEvent,
} from "../lib/stripe";
import { entitlementJson } from "../lib/views";

/** Buying listings and the Salon Plan (Stripe, or a mock checkout locally), and Stripe's webhooks. */
export const billingRoutes = createRouter();

const TAGS = ["Billing"];

const BillingSchema = z
  .object({
    billingOn: z.boolean().openapi({ description: "Real payments are switched on here." }),
    entitlement: EntitlementSchema,
    freeUntil: z.string().nullable(),
    listingCredits: z.number().int(),
    founding: z.boolean(),
    prices: z.object({
      singleListingCents: z.number().int(),
      planMonthlyCents: z
        .number()
        .int()
        .openapi({ description: "Your plan price (founding salons pay less)." }),
      listingDays: z.number().int(),
    }),
    subscription: z
      .object({ status: z.string(), currentPeriodEnd: z.string().nullable(), active: z.boolean() })
      .nullable(),
    payments: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["single_listing", "salon_plan", "founding_plan"]),
        amountCents: z.number().int(),
        status: z.enum(["pending", "paid", "failed"]),
        createdAt: z.string(),
      }),
    ),
  })
  .openapi("Billing");

const mockAllowed = (c: Context<AppEnv>) => isLocal(c.env) && !billingOn(c.env);

const billingOff = () =>
  new ApiError("billing_off", {
    detail: "Payments aren't switched on yet",
    hint: "Publishing is free during the launch period. Contact support@salonstaff.com.au to buy listings.",
  });

billingRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/billing",
    summary: "Your salon's billing",
    description:
      "Owners only. Whether you can publish now and how (free period, Salon Plan or credits), your prices, plan, and recent payments.",
    tags: TAGS,
    request: { params: SalonParams },
    responses: {
      200: json(BillingSchema, "Billing"),
      401: errors[401],
      403: problemResponse("Managers can't see billing"),
      404: problemResponse("Not one of your salons"),
    },
  }),
  async (c) => {
    const { salon, scope } = await requireSalon(c, c.req.valid("param").salonId, "owner");
    const payments = await scope.payments(10);
    return c.json(
      {
        billingOn: billingOn(c.env) || mockAllowed(c),
        entitlement: entitlementJson(salon),
        freeUntil: salon.freeUntil?.toISOString() ?? null,
        listingCredits: salon.listingCredits,
        founding: salon.founding,
        prices: {
          singleListingCents: PRICING.singleListingCents,
          planMonthlyCents: planPriceCents(salon.founding),
          listingDays: PRICING.listingDurationDays,
        },
        subscription: salon.subscriptionStatus
          ? {
              status: salon.subscriptionStatus,
              currentPeriodEnd: salon.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
              active: isSubscribed(salon),
            }
          : null,
        payments: payments.map((p) => ({
          id: encodeId("payment", p.id),
          kind: p.kind,
          amountCents: p.amountCents,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        })),
      },
      200,
    );
  },
);

billingRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/billing/checkout",
    summary: "Buy a listing or start the Salon Plan",
    description: `Owners only. Returns a checkout \`url\` (Stripe Checkout; locally a mock page). A single listing ($${PRICING.singleListingCents / 100}, GST included) adds one credit that publishes a job for ${PRICING.listingDurationDays} days. The Salon Plan is monthly with unlimited listings. What you bought arrives once the payment is confirmed.`,
    tags: TAGS,
    request: {
      params: SalonParams,
      ...jsonBody(z.object({ kind: z.enum(["single_listing", "salon_plan"]) }).openapi("Checkout")),
    },
    responses: {
      200: json(UrlResponse, "Where to pay"),
      400: errors[400],
      401: errors[401],
      403: problemResponse("Only owners buy listings"),
      404: problemResponse("Not one of your salons, or billing is off"),
      409: problemResponse("Already on the Salon Plan"),
    },
  }),
  async (c) => {
    const { salon, scope, actor } = await requireSalon(c, c.req.valid("param").salonId, "owner");
    const { kind } = c.req.valid("json");
    if (!billingOn(c.env) && !mockAllowed(c)) throw billingOff();
    if (kind === "salon_plan" && isSubscribed(salon)) {
      throw new ApiError("conflict", {
        detail: "You're already on the Salon Plan",
        hint: "Manage it with POST /v1/employer/salons/{salonId}/billing/portal.",
      });
    }
    const paymentKind: PaymentKind =
      kind === "single_listing"
        ? "single_listing"
        : salon.founding
          ? "founding_plan"
          : "salon_plan";
    const amountCents =
      kind === "single_listing" ? PRICING.singleListingCents : planPriceCents(salon.founding);
    if (c.get("dryRun"))
      return c.json({ url: appUrl(c, `/employer/${c.req.valid("param").salonId}/billing`) }, 200);

    if (!billingOn(c.env)) {
      const ref = `mock_${randomBase62(12)}`;
      await scope.startPayment(
        { kind: paymentKind, amountCents, provider: "mock", checkoutRef: ref },
        actor,
      );
      return c.json(
        { url: appUrl(c, `/dev/mock-checkout?ref=${ref}&salon=${c.req.valid("param").salonId}`) },
        200,
      );
    }

    let customerId = salon.stripeCustomerId;
    if (!customerId) {
      customerId = await createCustomer(c.env, {
        name: salon.name,
        salonId: salon.id,
        abn: salon.abn,
      });
      await scope.setStripeCustomer(customerId, actor);
    }
    const payment = await scope.startPayment(
      { kind: paymentKind, amountCents, provider: "stripe" },
      actor,
    );
    const session = await createCheckout(c.env, {
      customerId,
      kind,
      amountCents,
      productName:
        kind === "single_listing"
          ? `${BRAND.name} job listing (${PRICING.listingDurationDays} days)`
          : salon.founding
            ? "Salon Plan (founding salon price)"
            : "Salon Plan (unlimited listings)",
      metadata: { paymentId: payment.id, salonId: salon.id, kind: paymentKind },
      successUrl: appUrl(c, `/employer/${c.req.valid("param").salonId}/billing?status=success`),
      cancelUrl: appUrl(c, `/employer/${c.req.valid("param").salonId}/billing?status=cancelled`),
    });
    await scope.setCheckoutRef(payment.id, session.id);
    return c.json({ url: session.url }, 200);
  },
);

billingRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/billing/portal",
    summary: "Manage your plan and invoices",
    description:
      "Owners only. Returns a Stripe billing portal `url`: change or cancel the Salon Plan, see invoices.",
    tags: TAGS,
    request: { params: SalonParams },
    responses: {
      200: json(UrlResponse, "The billing portal"),
      401: errors[401],
      403: problemResponse("Only owners buy listings"),
      404: problemResponse("Not one of your salons, or billing is off"),
      409: problemResponse("Nothing bought yet"),
    },
  }),
  async (c) => {
    const { salon } = await requireSalon(c, c.req.valid("param").salonId, "owner");
    if (!billingOn(c.env)) throw billingOff();
    if (!salon.stripeCustomerId) {
      throw new ApiError("conflict", {
        detail: "There's nothing to manage yet",
        hint: "Buy a listing or start the Salon Plan with POST /v1/employer/salons/{salonId}/billing/checkout first.",
      });
    }
    if (c.get("dryRun"))
      return c.json({ url: appUrl(c, `/employer/${c.req.valid("param").salonId}/billing`) }, 200);
    const url = await billingPortalUrl(
      c.env,
      salon.stripeCustomerId,
      appUrl(c, `/employer/${c.req.valid("param").salonId}/billing`),
    );
    return c.json({ url }, 200);
  },
);

// ---------------------------------------------------------------------------
// Stripe webhooks
// ---------------------------------------------------------------------------

/** Applies one Stripe event. Every branch is safe to run twice (Stripe retries). */
async function handle(c: Context<AppEnv>, event: StripeEvent): Promise<void> {
  const db = await c.get("db")();
  const system = { type: "system" as const, requestId: c.get("requestId") };
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const periodEnd = subscriptionId ? await subscriptionPeriodEnd(c.env, subscriptionId) : null;
      await billing(db).fulfil(
        session.id,
        { subscriptionId, periodEnd: periodEnd ?? undefined },
        system,
      );
      return;
    }
    case "checkout.session.expired":
      await billing(db).fail(event.data.object.id, system);
      return;
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await billing(db).syncSubscription(
        subscription.id,
        subscription.status,
        periodEndOf(subscription),
        system,
      );
      return;
    }
    case "identity.verification_session.verified": {
      const sessionId = event.data.object.id;
      const idName = await identityName(c.env, sessionId);
      await checks(db).completeIdentity(sessionId, { status: "verified", idName }, system);
      // Deletes the ID images, selfie and extracted details at Stripe (D-03). Retried by the
      // next delivery of this event if it fails.
      await redactIdentitySession(c.env, sessionId);
      return;
    }
    case "identity.verification_session.requires_input":
      await checks(db).completeIdentity(event.data.object.id, { status: "requires_input" }, system);
      return;
    case "identity.verification_session.canceled":
      await checks(db).completeIdentity(event.data.object.id, { status: "failed" }, system);
      return;
    default:
      return;
  }
}

billingRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/webhooks/stripe",
    summary: "Stripe webhooks",
    description:
      "Checkout payments, subscription changes and Stripe Identity results, signed with the webhook secret (`Stripe-Signature`). For Stripe only.",
    tags: ["Webhooks"],
    responses: {
      200: json(z.object({ received: z.literal(true) }).openapi("WebhookReceived"), "Handled"),
      400: problemResponse("Not signed by Stripe"),
      404: problemResponse("Webhooks aren't set up here"),
    },
  }),
  async (c) => {
    if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
      throw new ApiError("not_found", {
        detail: "Stripe webhooks aren't set up here",
        hint: "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (docs/runbooks/stripe.md).",
      });
    }
    const signature = c.req.header("Stripe-Signature");
    const event = signature ? await verifiedEvent(c.env, await c.req.text(), signature) : null;
    if (!event) {
      throw new ApiError("validation_failed", {
        detail: "The request isn't signed by Stripe",
        hint: "Check STRIPE_WEBHOOK_SECRET matches the webhook endpoint's signing secret in Stripe.",
      });
    }
    await handle(c, event);
    return c.json({ received: true as const }, 200);
  },
);
