import type { Auth, CurrentSession } from "@salonstaff/auth";
import type { Db } from "@salonstaff/db";
import type { EmailSender } from "@salonstaff/email";
import type { TimingVariables } from "hono/timing";
import type { JWTVerifyGetKey } from "jose";
import type { SmsSender } from "./lib/sms";
import type { RequestTimings } from "./middleware/request-context";

/** Bindings, variables and secrets configured in wrangler.jsonc and the Cloudflare dashboard. */
export interface Env {
  HYPERDRIVE: Hyperdrive;
  /** 300 requests a minute per caller. */
  RATE_LIMITER: RateLimit;
  /** Sign-in codes: 10 a minute per address and per IP. */
  AUTH_RATE_LIMITER: RateLimit;
  /** 30 uploads a minute per person. */
  UPLOAD_RATE_LIMITER: RateLimit;
  /** Public pictures (profile photos, portfolios, salon logos). Only the API writes to it. */
  MEDIA: R2Bucket;
  /** Where MEDIA is read from, no trailing slash: https://cdn.salonstaff.com.au deployed; a route on the API locally. */
  MEDIA_URL: string;
  /** Never served publicly: certificates waiting for review. Deleted once decided. */
  PRIVATE: R2Bucket;
  /** From `.dev.vars` locally. Unset counts as production. Never set in wrangler.jsonc. */
  ENVIRONMENT?: "local" | "production";
  /** `off` switches the general rate limit off. Honoured only locally. */
  RATE_LIMITS?: string;
  /** The website's origin, e.g. https://salonstaff.com.au. Links in emails point here. */
  APP_ORIGIN: string;
  /** The admin portal's origin. Staff passkeys belong to its hostname. */
  ADMIN_ORIGIN: string;
  /** Comma-separated origins allowed to call the API from a browser with cookies. */
  APP_ORIGINS: string;
  /** Sender shown on emails, e.g. `Salon Staff <hello@salonstaff.com.au>`. */
  EMAIL_FROM: string;
  /** Cloudflare Access in front of the admin portal. Unset locally, where a staff picker stands in. */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** `stripe` (Stripe Identity) deployed; `mock` locally. */
  IDENTITY_PROVIDER?: "stripe" | "mock";
  /** `on` turns billing on (Stripe Checkout). Off: locally a mock checkout, deployed no purchases. */
  BILLING?: string;

  // Secrets. Locally from .dev.vars; deployed, set by Matt with `wrangler secret put`.
  AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  /** Local only: Mailpit's HTTP API, which also receives SMS codes. */
  MAILPIT_URL?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_BUNDLE_ID?: string;
  /** Apple push notifications (APNs, D-15): a key with APNs enabled. Uses APPLE_TEAM_ID and APPLE_BUNDLE_ID. */
  APNS_KEY_ID?: string;
  /** The APNs key's .p8 contents. */
  APNS_PRIVATE_KEY?: string;
  /** Australian Business Register lookup GUID. Without it ABNs are only checksum-checked. */
  ABR_GUID?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export interface Variables extends TimingVariables {
  requestId: string;
  timings: RequestTimings;
  /** True when the caller asked for `?dry_run=true` on a change. */
  dryRun: boolean;
  /** Opens the database connection on first use; closed automatically after the response. */
  db: () => Promise<Db>;
  /** Work to finish after the response (notices). The database connection closes after it. */
  background: (task: Promise<unknown>) => void;
  email: () => EmailSender;
  sms: () => SmsSender;
  auth: () => Promise<Auth>;
  /** The signed-in person (cookie or bearer token), or null. Looked up once, on first use. */
  session: () => Promise<CurrentSession | null>;
  /** Test stand-in for Cloudflare Access's signing keys. */
  accessKeys?: JWTVerifyGetKey;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
