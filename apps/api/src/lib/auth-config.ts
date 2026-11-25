import { type AuthConfig, appleClientSecret, createAuth } from "@salonstaff/auth";
import { type Db, recordAudit } from "@salonstaff/db";
import { createEmailSender, type EmailSender, signInCodeEmail } from "@salonstaff/email";
import { BRAND, LIMITS } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv, Env } from "../env";

/** A setting the Worker needs is missing. Logged, and answered as a plain 500. */
export class ConfigurationError extends Error {
  override name = "ConfigurationError";
}

export const isLocal = (env: Env) => env.ENVIRONMENT === "local";

export function emailSenderFromEnv(env: Env): EmailSender {
  if (env.RESEND_API_KEY) {
    return createEmailSender({
      provider: "resend",
      from: env.EMAIL_FROM,
      apiKey: env.RESEND_API_KEY,
    });
  }
  if (env.MAILPIT_URL && isLocal(env)) {
    return createEmailSender({ provider: "mailpit", from: env.EMAIL_FROM, url: env.MAILPIT_URL });
  }
  throw new ConfigurationError(
    "No email provider is configured. Set the RESEND_API_KEY secret on this Worker.",
  );
}

export const appOrigins = (env: Env) =>
  env.APP_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

/** Apple's client secret lasts 30 days; one per isolate is plenty. */
let appleSecret: { value: string; madeAt: number } | undefined;
async function apple(env: Env) {
  if (!env.APPLE_CLIENT_ID || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY)
    return undefined;
  if (!appleSecret || Date.now() - appleSecret.madeAt > 7 * 24 * 3600_000) {
    appleSecret = {
      value: await appleClientSecret({
        teamId: env.APPLE_TEAM_ID,
        keyId: env.APPLE_KEY_ID,
        clientId: env.APPLE_CLIENT_ID,
        privateKey: env.APPLE_PRIVATE_KEY,
      }),
      madeAt: Date.now(),
    };
  }
  return {
    clientId: env.APPLE_CLIENT_ID,
    clientSecret: appleSecret.value,
    appBundleIdentifier: env.APPLE_BUNDLE_ID,
  };
}

export async function authConfig(c: Context<AppEnv>, db: Db): Promise<AuthConfig> {
  const env = c.env;
  if (!env.AUTH_SECRET)
    throw new ConfigurationError("The AUTH_SECRET secret is not set on this Worker.");
  const audit = (userId: string, action: string) =>
    recordAudit(
      db,
      {
        type: "user",
        id: userId,
        ip: c.req.header("CF-Connecting-IP"),
        requestId: c.get("requestId"),
      },
      { action, targetType: "user", targetId: userId },
    );
  return {
    db,
    secret: env.AUTH_SECRET,
    baseUrl: `${env.APP_ORIGIN}/api/v1/auth`,
    trustedOrigins: appOrigins(env),
    environment: isLocal(env) ? "local" : "production",
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        : undefined,
    apple: await apple(env),
    sendEmailCode: async ({ email, code }) => {
      await c
        .get("email")()
        .send(await signInCodeEmail({ to: email, code, expiresInMinutes: LIMITS.otpTtlMinutes }));
    },
    sendSmsCode: async ({ phoneNumber, code }) => {
      await c
        .get("sms")()
        .send({
          to: phoneNumber,
          body: `${code} is your ${BRAND.name} code. It expires in ${LIMITS.otpTtlMinutes} minutes.`,
        });
    },
    onSignUp: ({ userId }) => audit(userId, "auth.signed_up"),
    onSignIn: ({ userId }) => audit(userId, "auth.signed_in"),
  };
}

export async function authFor(c: Context<AppEnv>) {
  return createAuth(await authConfig(c, await c.get("db")()));
}
