/**
 * Sign-in for Salon Staff. Better Auth does the work; everything else in the codebase goes
 * through this package, so replacing it later means changing this package only.
 *
 * Ways in (one flow for sign-in and sign-up: an account is made the first time):
 *  - Google, Apple
 *  - a 6-digit code by email (emailOTP)
 *  - a 6-digit code by SMS (phoneNumber, sent with Twilio)
 * There are no passwords. Changing the account's email sends a code to the new address first. Mobile apps use the bearer plugin: the session token in a header.
 */
import { type Db, schema } from "@salonstaff/db";
import { BRAND, LIMITS, uuidv7 } from "@salonstaff/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { makeSignature } from "better-auth/crypto";
import { bearer, emailOTP, phoneNumber } from "better-auth/plugins";
import { importPKCS8, SignJWT } from "jose";

/** Where the sign-in endpoints live on the API. */
export const AUTH_PATH = "/v1/auth";

/** People who sign up by mobile get this stand-in address until they add a real one. */
export const PHONE_EMAIL_DOMAIN = `phone.${BRAND.slug}.invalid`;
export const isStandInEmail = (email: string) => email.endsWith(`@${PHONE_EMAIL_DOMAIN}`);

const DAY_SECONDS = 24 * 60 * 60;

/** The other ways in, besides an email or SMS code. */
export const SOCIAL_PROVIDERS = ["google", "apple"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface AuthConfig {
  db: Db;
  /** Signs session cookies. Different in every environment. */
  secret: string;
  /**
   * The public address of the sign-in endpoints, e.g. https://salonstaff.com.au/api/v1/auth.
   * Google and Apple send people back here, so it must be the website's own origin.
   */
  baseUrl: string;
  /** Origins of our web apps: the only places a sign-in may redirect to. */
  trustedOrigins: string[];
  environment: "local" | "production";
  google?: OAuthCredentials | undefined;
  /** `clientSecret` is the short-lived JWT from `appleClientSecret`. */
  apple?: (OAuthCredentials & { appBundleIdentifier?: string | undefined }) | undefined;
  /** `change-email` when the code proves a new address for the account. */
  sendEmailCode: (message: {
    email: string;
    code: string;
    purpose: "sign-in" | "change-email";
  }) => Promise<void>;
  sendSmsCode: (message: { phoneNumber: string; code: string }) => Promise<void>;
  /** Called once an account exists, for the audit log. */
  onSignUp?: ((person: { userId: string }) => Promise<void>) | undefined;
  /** Called when Google or Apple is connected to an account, for the audit log. */
  onLink?: ((event: { userId: string; provider: string }) => Promise<void>) | undefined;
  /** Called each time a session starts, for the audit log. */
  onSignIn?: ((event: { userId: string; ip: string | null }) => Promise<void>) | undefined;
}

const suspended = () =>
  new APIError("FORBIDDEN", {
    code: "ACCOUNT_SUSPENDED",
    message: `This account has been suspended. Contact ${BRAND.supportEmail} if you think this is a mistake.`,
  });

export function createAuth(config: AuthConfig) {
  const codeTtl = LIMITS.otpTtlMinutes * 60;
  return betterAuth({
    appName: BRAND.name,
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    onAPIError: { errorURL: `${new URL(config.baseUrl).origin}/sign-in` },
    database: drizzleAdapter(config.db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),

    socialProviders: {
      ...(config.google ? { google: { ...config.google, prompt: "select_account" as const } } : {}),
      ...(config.apple ? { apple: config.apple } : {}),
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: codeTtl,
        allowedAttempts: LIMITS.otpMaxAttempts,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }) => {
          await config.sendEmailCode({
            email,
            code: otp,
            purpose: type === "change-email" ? "change-email" : "sign-in",
          });
        },
        // The API's /v1/me/email routes call these (they audit it and tell the old address).
        changeEmail: { enabled: true },
      }),
      phoneNumber({
        otpLength: 6,
        expiresIn: codeTtl,
        allowedAttempts: LIMITS.otpMaxAttempts,
        phoneNumberValidator: (value) => /^\+61[2-478]\d{8}$/.test(value),
        sendOTP: async ({ phoneNumber: number, code }) => {
          await config.sendSmsCode({ phoneNumber: number, code });
        },
        signUpOnVerification: {
          getTempEmail: (number) => `${number.replace(/[^\d]/g, "")}@${PHONE_EMAIL_DOMAIN}`,
          getTempName: () => "",
        },
      }),
      bearer(),
    ],

    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "seeker", input: true },
        suspendedAt: { type: "date", required: false, input: false },
        suspendedReason: { type: "string", required: false, input: false },
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "apple"],
        // Connecting Google or Apple from the account page: its address needn't be the account's
        // (a mobile-only account has none, and people use a different Gmail for work).
        allowDifferentEmails: true,
      },
    },

    session: {
      expiresIn: LIMITS.sessionDays * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },

    databaseHooks: {
      account: {
        create: {
          after: async (account) => {
            if (SOCIAL_PROVIDERS.includes(account.providerId as SocialProvider)) {
              await config.onLink?.({ userId: account.userId, provider: account.providerId });
            }
          },
        },
      },
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, role: user.role === "employer" ? "employer" : "seeker" },
          }),
          after: async (user) => {
            await config.onSignUp?.({ userId: user.id });
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            const user = await context?.context.internalAdapter.findUserById(session.userId);
            if ((user as { suspendedAt?: Date | null } | null)?.suspendedAt) throw suspended();
            return { data: session };
          },
          after: async (session) => {
            await config.onSignIn?.({ userId: session.userId, ip: session.ipAddress ?? null });
          },
        },
      },
    },

    // Cloudflare rate-limit bindings on the API do this (apps/api/wrangler.jsonc).
    rateLimit: { enabled: false },

    advanced: {
      cookiePrefix:
        config.environment === "production" ? BRAND.slug : `${BRAND.slug}-${config.environment}`,
      useSecureCookies: config.environment !== "local",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      database: { generateId: () => uuidv7() },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export interface SessionUser {
  id: string;
  name: string;
  /** Null when the account has only the stand-in address from a mobile sign-up. */
  email: string | null;
  phoneNumber: string | null;
  role: "seeker" | "employer";
  suspendedAt: Date | null;
  createdAt: Date;
}

export interface CurrentSession {
  user: SessionUser;
  session: { id: string; token: string; createdAt: Date; expiresAt: Date };
}

/** The signed-in person for a request (cookie or bearer token), or null. Banned people get null. */
export async function getSession(auth: Auth, headers: Headers): Promise<CurrentSession | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  const user = result.user as typeof result.user & {
    phoneNumber?: string | null;
    role?: string | null;
    suspendedAt?: Date | null;
  };
  if (user.suspendedAt) return null;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: isStandInEmail(user.email) ? null : user.email,
      phoneNumber: user.phoneNumber ?? null,
      role: user.role === "employer" ? "employer" : "seeker",
      suspendedAt: user.suspendedAt ?? null,
      createdAt: user.createdAt,
    },
    session: {
      id: result.session.id,
      token: result.session.token,
      createdAt: result.session.createdAt,
      expiresAt: result.session.expiresAt,
    },
  };
}

/** Why an email change was refused, in words the API can turn into its own errors. */
export type EmailChangeProblem =
  | "same"
  | "invalid_code"
  | "expired"
  | "too_many_attempts"
  | "in_use";

export type EmailChangeResult =
  | { ok: true; headers: Headers }
  | { ok: false; problem: EmailChangeProblem };

function emailChangeProblem(error: unknown): EmailChangeProblem | null {
  if (!(error instanceof APIError)) return null;
  const body = (error.body ?? {}) as { code?: string; message?: string };
  const said = `${body.code ?? ""} ${body.message ?? error.message}`.toLowerCase();
  if (said.includes("expired")) return "expired";
  if (said.includes("too many")) return "too_many_attempts";
  if (said.includes("invalid otp") || said.includes("invalid_otp")) return "invalid_code";
  if (said.includes("already in use")) return "in_use";
  if (said.includes("is the same")) return "same";
  return null;
}

async function changing(run: () => Promise<Headers>): Promise<EmailChangeResult> {
  try {
    return { ok: true, headers: await run() };
  } catch (error) {
    const problem = emailChangeProblem(error);
    if (problem) return { ok: false, problem };
    throw error;
  }
}

/**
 * Step one of changing the signed-in person's email: a code to the new address. When the
 * address already belongs to another account nothing is sent, and the answer is the same, so
 * nobody can find out who has an account.
 */
export function requestEmailChange(auth: Auth, headers: Headers, newEmail: string) {
  return changing(async () => {
    await auth.api.requestEmailChangeEmailOTP({ headers, body: { newEmail } });
    return new Headers();
  });
}

/**
 * Step two: the code from the new address. On success the account's email is the new one
 * (verified); `headers` carries the refreshed session cookie to pass on.
 */
export function confirmEmailChange(auth: Auth, headers: Headers, newEmail: string, code: string) {
  return changing(async () => {
    const result = await auth.api.changeEmailEmailOTP({
      headers,
      body: { newEmail, otp: code },
      returnHeaders: true,
    });
    return result.headers;
  });
}

/**
 * Sign in with Apple's client secret: a JWT signed with your Apple key, valid for up to six
 * months. Made fresh when the API starts handling sign-ins, so nobody has to rotate it by hand.
 */
export async function appleClientSecret(options: {
  teamId: string;
  keyId: string;
  clientId: string;
  /** The .p8 key's contents. */
  privateKey: string;
}): Promise<string> {
  const key = await importPKCS8(options.privateKey.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: options.keyId })
    .setIssuer(options.teamId)
    .setSubject(options.clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

/**
 * Local development only: signs in as `email` (making the account if needed) without a code,
 * and returns the session cookie to set. The API exposes this only when ENVIRONMENT is local.
 */
export async function signInWithoutCode(
  config: AuthConfig,
  person: { email: string; name: string; role: "seeker" | "employer" },
  /** Kept with the session, as a real sign-in keeps them, for "Where you're signed in". */
  device: { ipAddress?: string | undefined; userAgent?: string | undefined } = {},
): Promise<string> {
  const auth = createAuth(config);
  const context = await auth.$context;
  const email = person.email.toLowerCase();
  const existing = await context.internalAdapter.findUserByEmail(email);
  // The same rule as a real sign-in: a banned person gets no session.
  if ((existing?.user as { suspendedAt?: Date | null } | undefined)?.suspendedAt) throw suspended();
  const user =
    existing?.user ??
    (await context.internalAdapter.createUser(
      { email, name: person.name, emailVerified: true, role: person.role },
      { method: "email-otp" },
    ));
  const session = await context.internalAdapter.createSession(user.id, false, {
    ipAddress: device.ipAddress ?? "",
    userAgent: device.userAgent ?? "",
  });
  const { name: cookieName, attributes } = context.authCookies.sessionToken;
  // Signed the way the library signs it, so it reads this cookie as its own.
  const value = `${session.token}.${await makeSignature(session.token, context.secret)}`;
  return `${cookieName}=${encodeURIComponent(value)}; Path=${attributes.path ?? "/"}; HttpOnly; SameSite=Lax`;
}
