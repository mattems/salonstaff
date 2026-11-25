import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { connect, type Db } from "@salonstaff/db";
import type { EmailMessage } from "@salonstaff/email";
import type { SQL } from "drizzle-orm";
import type { JWTVerifyGetKey } from "jose";
import { createApp } from "../src/app";
import type { Env } from "../src/env";

export const APP_ORIGIN = "http://localhost:5300";

/** A local .dev.vars may turn billing on with a real sandbox's keys: tests never reach Stripe. */
export const NO_BILLING = {
  BILLING: undefined,
  STRIPE_SECRET_KEY: undefined,
  STRIPE_WEBHOOK_SECRET: undefined,
};

/**
 * Nor do tests reach anything else outside: the business register, Twilio or Resend. A local
 * .dev.vars may hold real values for trying them by hand.
 */
export const NO_OUTSIDE_SERVICES = {
  ABR_GUID: undefined,
  TWILIO_ACCOUNT_SID: undefined,
  TWILIO_AUTH_TOKEN: undefined,
  TWILIO_FROM: undefined,
  RESEND_API_KEY: undefined,
  IDENTITY_PROVIDER: "mock" as const,
};

/** A limiter that always allows, so a busy test file can't trip the real limits. */
const unlimited = { limit: async () => ({ success: true }) } as unknown as RateLimit;

/** An app whose outgoing email (and, locally, SMS) is collected in `sent` instead of delivered. */
export function createTestApp(
  options: { emailFails?: boolean; accessKeys?: JWTVerifyGetKey; env?: Partial<Env> } = {},
) {
  const sent: EmailMessage[] = [];
  const app = createApp({
    ...(options.accessKeys ? { accessKeys: options.accessKeys } : {}),
    emailSender: {
      send: async (message) => {
        if (options.emailFails) throw new Error("The email provider is down");
        sent.push(message);
      },
    },
  });

  async function call(path: string, init: RequestInit = {}, overrides: Partial<Env> = {}) {
    const ctx = createExecutionContext();
    const bindings = {
      ...env,
      RATE_LIMITER: unlimited,
      AUTH_RATE_LIMITER: unlimited,
      UPLOAD_RATE_LIMITER: unlimited,
      ...NO_BILLING,
      ...NO_OUTSIDE_SERVICES,
      ...options.env,
      ...overrides,
    };
    const response = await app.request(path, init, bindings, ctx);
    await waitOnExecutionContext(ctx);
    return response;
  }

  /** A signed-in person (made on first use). `api` sends requests as them, with their cookie. */
  async function person(
    name: string,
    options: { role?: "seeker" | "employer"; email?: string } = {},
  ) {
    const email =
      options.email ?? `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const login = await call("/v1/auth/dev-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: options.role ?? "seeker" }),
    });
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown) {
      const isForm = body instanceof FormData;
      const response = await call(path, {
        method,
        headers: {
          Cookie: cookie,
          Origin: APP_ORIGIN,
          ...(body === undefined || isForm ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) }),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: (text ? JSON.parse(text) : {}) as T,
        headers: response.headers,
      };
    }
    return { name, email, cookie, api };
  }

  return { sent, call, person };
}

export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const { db, close } = await connect(env.HYPERDRIVE.connectionString);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

/** Runs one SQL statement and returns its rows. */
export function query<T extends Record<string, unknown>>(statement: SQL) {
  return withDb(async (db) => (await db.execute<T>(statement)).rows);
}

/** The 6-digit code in the most recent email (or local SMS) to `to`. */
export function codeFor(sent: EmailMessage[], to: string): string {
  const message = [...sent].reverse().find((m) => m.to === to);
  const match = message?.text.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`No code sent to ${to}`);
  return match[1] as string;
}
