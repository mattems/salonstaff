# Runbook: Stripe (billing and identity checks)

## Billing
1. Stripe → Developers → API keys: secret key → `STRIPE_SECRET_KEY` (API Worker secret).
2. Webhooks → add endpoint `https://api.salonstaff.com.au/v1/webhooks/stripe` with events
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `identity.verification_session.verified`, `identity.verification_session.requires_input`,
   `identity.verification_session.canceled` → signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Set `"BILLING": "on"` in `apps/api/wrangler.jsonc` (`env.production.vars`) and deploy.
4. Billing portal: Stripe → Settings → Billing → Customer portal → activate.
Prices are inline (from `PRICING`), GST-inclusive, AUD; no products to create.

## Identity checks (Stripe Identity)
1. Stripe → Identity → activate (business review may take a few days).
2. `IDENTITY_PROVIDER` is already `stripe` in production. The webhook above delivers results.
Locally a mock page stands in (`IDENTITY_PROVIDER=mock`).
