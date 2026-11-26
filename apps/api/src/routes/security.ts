import { createRoute, z } from "@hono/zod-openapi";
import {
  confirmEmailChange,
  type EmailChangeProblem,
  requestEmailChange,
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from "@salonstaff/auth";
import { seeker, signIns } from "@salonstaff/db";
import {
  ApiError,
  BRAND,
  describeDevice,
  emailChangeConfirmSchema,
  emailChangeSchema,
  encodeId,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { userActor } from "../lib/actor";
import { providersAvailable } from "../lib/auth-config";
import { appUrl, sendEmail } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { errors, json, jsonBody, MeSchema, pathParam } from "../lib/schemas";
import { idFrom, requireUser } from "../lib/session";
import { withinCodeLimit } from "./auth";
import { meJson } from "./me";

/**
 * How the signed-in person gets in: their email (changed with a code to the new address),
 * Google and Apple, and the devices they're signed in on.
 */
export const securityRoutes = createRouter();

const TAGS = ["Sign-in and security"];

const LABELS: Record<SocialProvider, string> = { google: "Google", apple: "Apple" };

const tooFast = () =>
  new ApiError("rate_limited", {
    detail: "Too many codes asked for or tried",
    hint: "Wait a minute and try again.",
  });

async function requireCodeAllowance(c: Context<AppEnv>) {
  if (!(await withinCodeLimit(c))) throw tooFast();
}

const codeField = (message: string) =>
  new ApiError("validation_failed", {
    detail: message,
    hint: "Ask for a new code with POST /v1/me/email, then send the newest one.",
    errors: [{ path: "code", message }],
  });

function emailChangeError(problem: EmailChangeProblem): ApiError {
  switch (problem) {
    case "same":
      return new ApiError("conflict", {
        detail: "That's already your email",
        hint: "Send a different address.",
        errors: [{ path: "email", message: "That's already your email" }],
      });
    case "in_use":
      return new ApiError("conflict", {
        detail: "That email belongs to another account",
        hint: "Use a different address, or sign in with that one instead.",
        errors: [{ path: "email", message: "That email belongs to another account" }],
      });
    case "expired":
      return codeField("That code has expired. Ask for a new one.");
    case "too_many_attempts":
      return codeField("Too many wrong tries. Ask for a new code.");
    case "invalid_code":
      return codeField("That code isn't right. Check it, or ask for a new one.");
  }
}

// ---------- Email ----------

const CodeSentSchema = z
  .object({
    sentTo: z.string().openapi({ example: "olive@example.com" }),
  })
  .openapi("EmailCodeSent");

securityRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/email",
    summary: "Change your email: send a code",
    description: `Sends a 6-digit code to the new address; it lasts 10 minutes. Confirm the change with POST /v1/me/email/confirm. For an account made with a mobile number, this adds its first email. If the address already belongs to another account, nothing is sent (the answer is the same, so nobody can find out who has an account). Shares the sign-in codes' rate limit.`,
    tags: TAGS,
    request: jsonBody(emailChangeSchema),
    responses: {
      200: json(CodeSentSchema, "Code sent"),
      400: errors[400],
      401: errors[401],
      409: problemResponse("That's already your email"),
      429: problemResponse("Too many codes"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const { email } = c.req.valid("json");
    if (email === session.user.email) throw emailChangeError("same");
    if (c.get("dryRun")) return c.json({ sentTo: email }, 200);
    await requireCodeAllowance(c);
    const result = await requestEmailChange(await c.get("auth")(), c.req.raw.headers, email);
    if (!result.ok) throw emailChangeError(result.problem);
    return c.json({ sentTo: email }, 200);
  },
);

securityRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/email/confirm",
    summary: "Change your email: confirm with the code",
    description: `The code from the new address. Your account's email becomes that address: email codes go there from now on, and your old address is told about the change. Google and Apple stay connected. With \`dry_run\` only the form is checked (the code isn't used up).`,
    tags: TAGS,
    request: jsonBody(emailChangeConfirmSchema),
    responses: {
      200: json(MeSchema, "Your account, with its new email"),
      400: problemResponse("Not valid, or the code is wrong or has expired"),
      401: errors[401],
      409: problemResponse("That's already your email, or another account's"),
      429: problemResponse("Too many tries"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const { email, code } = c.req.valid("json");
    if (email === session.user.email) throw emailChangeError("same");
    const db = await c.get("db")();
    const me = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      const account = await me.account();
      if (!account) throw new ApiError("unauthenticated", { hint: "Sign in again." });
      return c.json(meJson(c, { ...account, user: { ...account.user, email } }), 200);
    }
    await requireCodeAllowance(c);
    const result = await confirmEmailChange(await c.get("auth")(), c.req.raw.headers, email, code);
    if (!result.ok) throw emailChangeError(result.problem);
    for (const cookie of result.headers.getSetCookie()) {
      c.header("Set-Cookie", cookie, { append: true });
    }

    const before = session.user.email;
    await signIns(db, session.user.id).recordEmailChange(
      before,
      email,
      userActor(c, session.user.id),
    );
    if (before) {
      sendEmail(c, before, {
        subject: `Your ${BRAND.name} email was changed`,
        title: "Your email address was changed",
        body: `The email on your ${BRAND.name} account is now ${email}, and sign-in codes go there. If you didn't do this, contact ${BRAND.supportEmail} straight away.`,
        action: "Go to your account",
        url: appUrl(c, session.user.role === "employer" ? "/employer/account" : "/account"),
        footer: `You received this because this address was on a ${BRAND.name} account.`,
      });
    }
    const account = await me.account();
    if (!account) throw new ApiError("unauthenticated", { hint: "Sign in again." });
    return c.json(meJson(c, account), 200);
  },
);

// ---------- Google and Apple ----------

const ProviderSchema = z.enum(SOCIAL_PROVIDERS);

const SignInMethodsSchema = z
  .object({
    email: z.string().nullable().openapi({
      description: "Codes by email go here. Null for an account made with a mobile number.",
    }),
    phoneNumber: z.string().nullable().openapi({ description: "Codes by SMS go here." }),
    providers: z.array(
      z.object({
        provider: ProviderSchema,
        label: z.string().openapi({ example: "Google" }),
        available: z
          .boolean()
          .openapi({ description: "False when this site isn't set up for it yet." }),
        connected: z.boolean(),
        connectedAt: z.string().nullable().openapi({ format: "date-time" }),
      }),
    ),
  })
  .openapi("SignInMethods");

async function signInMethodsJson(c: Context<AppEnv>, userId: string) {
  const session = await requireUser(c);
  const connected = await signIns(await c.get("db")(), userId).providers();
  const available = providersAvailable(c.env);
  return {
    email: session.user.email,
    phoneNumber: session.user.phoneNumber,
    providers: SOCIAL_PROVIDERS.map((provider) => {
      const row = connected.find((item) => item.provider === provider);
      return {
        provider,
        label: LABELS[provider],
        available: available[provider],
        connected: Boolean(row),
        connectedAt: row?.connectedAt.toISOString() ?? null,
      };
    }),
  };
}

securityRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/sign-in-methods",
    summary: "How you sign in",
    description:
      "Your email and mobile (codes go to them) and whether Google and Apple are connected. Connect one with Better Auth's POST /v1/auth/link-social (`provider`, `callbackURL`); you're sent to Google or Apple and back. Its address needn't match your account's.",
    tags: TAGS,
    responses: { 200: json(SignInMethodsSchema, "How you sign in"), 401: errors[401] },
  }),
  async (c) => {
    const session = await requireUser(c);
    return c.json(await signInMethodsJson(c, session.user.id), 200);
  },
);

securityRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/sign-in-methods/{provider}",
    summary: "Disconnect Google or Apple",
    description:
      "You can still sign in with a code to your email or mobile. Refused when there's neither.",
    tags: TAGS,
    request: {
      params: z.object({
        provider: ProviderSchema.openapi({
          param: { name: "provider", in: "path" },
          example: "google",
        }),
      }),
    },
    responses: {
      200: json(SignInMethodsSchema, "How you sign in now"),
      401: errors[401],
      404: problemResponse("Not connected"),
      409: problemResponse("It's your only way in"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const { provider } = c.req.valid("param");
    const scope = signIns(await c.get("db")(), session.user.id);
    const connected = await scope.providers();
    if (!connected.some((item) => item.provider === provider)) {
      throw new ApiError("not_found", {
        detail: `${LABELS[provider]} isn't connected to your account`,
        hint: "See what's connected with GET /v1/me/sign-in-methods.",
      });
    }
    // Codes always work for an email or a mobile; without either, this is the only way in.
    const otherWays =
      Boolean(session.user.email || session.user.phoneNumber) || connected.length > 1;
    if (!otherWays) {
      throw new ApiError("conflict", {
        detail: `${LABELS[provider]} is the only way into your account`,
        hint: "Add an email with POST /v1/me/email first.",
      });
    }
    if (!c.get("dryRun")) await scope.disconnect(provider, userActor(c, session.user.id));
    const methods = await signInMethodsJson(c, session.user.id);
    if (c.get("dryRun")) {
      methods.providers = methods.providers.map((item) =>
        item.provider === provider ? { ...item, connected: false, connectedAt: null } : item,
      );
    }
    return c.json(methods, 200);
  },
);

// ---------- Where you're signed in ----------

const SessionSchema = z
  .object({
    id: z.string().openapi({ example: "ses_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    device: z.string().openapi({ example: "Chrome on macOS" }),
    ipAddress: z.string().nullable(),
    signedInAt: z.string().openapi({ format: "date-time" }),
    lastActiveAt: z.string().openapi({
      format: "date-time",
      description: "Updated at most once a day as the session is used.",
    }),
    current: z.boolean().openapi({ description: "The device making this request." }),
  })
  .openapi("SignInSession");

const SessionsSchema = z.object({ items: z.array(SessionSchema) }).openapi("SignInSessions");

securityRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/sessions",
    summary: "Where you're signed in",
    description: "Each browser or app signed in to your account, most recently used first.",
    tags: TAGS,
    responses: { 200: json(SessionsSchema, "Your sessions"), 401: errors[401] },
  }),
  async (c) => {
    const session = await requireUser(c);
    const rows = await signIns(await c.get("db")(), session.user.id).sessions();
    return c.json(
      {
        items: rows.map((row) => ({
          id: encodeId("session", row.id),
          device: describeDevice(row.userAgent),
          ipAddress: row.ipAddress,
          signedInAt: row.createdAt.toISOString(),
          lastActiveAt: row.updatedAt.toISOString(),
          current: row.id === session.session.id,
        })),
      },
      200,
    );
  },
);

const SignedOutSchema = z
  .object({ signedOut: z.number().int().openapi({ description: "How many devices." }) })
  .openapi("SignedOut");

securityRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/sessions/{id}",
    summary: "Sign out a device",
    description: "To sign out of the device you're using, use POST /v1/auth/sign-out instead.",
    tags: TAGS,
    request: { params: z.object({ id: pathParam("id", "ses_01k6q2x8h4f7tbn3m9vz5cdr0e") }) },
    responses: {
      200: json(SignedOutSchema, "Signed out"),
      401: errors[401],
      404: errors[404],
      409: problemResponse("That's this device"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const hint = "List your sessions with GET /v1/me/sessions and use an `id` from there.";
    const id = idFrom("session", c.req.valid("param").id, "session of yours", hint);
    if (id === session.session.id) {
      throw new ApiError("conflict", {
        detail: "That's the device you're using",
        hint: "Sign out of it with POST /v1/auth/sign-out.",
      });
    }
    const scope = signIns(await c.get("db")(), session.user.id);
    const ended = c.get("dryRun")
      ? (await scope.sessions()).some((row) => row.id === id)
      : await scope.endSession(id, userActor(c, session.user.id));
    if (!ended)
      throw new ApiError("not_found", { detail: "No session of yours with that ID", hint });
    return c.json({ signedOut: 1 }, 200);
  },
);

securityRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/sessions",
    summary: "Sign out everywhere else",
    description: "Signs out every browser and app but the one making this request.",
    tags: TAGS,
    responses: { 200: json(SignedOutSchema, "Signed out"), 401: errors[401] },
  }),
  async (c) => {
    const session = await requireUser(c);
    const scope = signIns(await c.get("db")(), session.user.id);
    const signedOut = c.get("dryRun")
      ? (await scope.sessions()).filter((row) => row.id !== session.session.id).length
      : await scope.endOtherSessions(session.session.id, userActor(c, session.user.id));
    return c.json({ signedOut }, 200);
  },
);
