import { type AuthConfig, appleClientSecret, createAuth } from "@salonstaff/auth";
import { type Db, recordAudit } from "@salonstaff/db";
import { createEmailSender, type EmailSender, signInCodeEmail } from "@salonstaff/email";
import { ApiError, BRAND, LIMITS } from "@salonstaff/shared";
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

/** Which of Google and Apple this Worker has the keys for. */
export const providersAvailable = (env: Env) => ({
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  apple: Boolean(
    env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY,
  ),
});

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
  const audit = (userId: string, action: string, after?: unknown) =>
    recordAudit(
      db,
      {
        type: "user",
        id: userId,
        ip: c.req.header("CF-Connecting-IP"),
        requestId: c.get("requestId"),
      },
      { action, targetType: "user", targetId: userId, after },
    );
  const verify = c.get("phoneVerify")();
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
    sendEmailCode: async ({ email, code, purpose }) => {
      await c
        .get("email")()
        .send(
          await signInCodeEmail({
            to: email,
            code,
            expiresInMinutes: LIMITS.otpTtlMinutes,
            purpose,
          }),
        );
    },
    sendSmsCode: async ({ phoneNumber, code }) => {
      // Twilio Verify makes and sends its own code (D-23).
      if (verify) return verify.start(phoneNumber, "sms");
      await c
        .get("sms")()
        .send({
          to: phoneNumber,
          body: `${code} is your ${BRAND.name} code. It expires in ${LIMITS.otpTtlMinutes} minutes.`,
        });
    },
    checkSmsCode: verify
      ? async ({ phoneNumber, code }) => {
          try {
            return await verify.check(phoneNumber, code);
          } catch (error) {
            // Expired or used up: just not the right code, as Better Auth sees it.
            if (error instanceof ApiError && error.code === "link_expired") return false;
            throw error;
          }
        }
      : undefined,
    onSignUp: ({ userId }) => audit(userId, "auth.signed_up"),
    onSignIn: ({ userId }) => audit(userId, "auth.signed_in"),
    onLink: ({ userId, provider }) => audit(userId, "auth.provider_connected", { provider }),
  };
}

export async function authFor(c: Context<AppEnv>) {
  return createAuth(await authConfig(c, await c.get("db")()));
}
