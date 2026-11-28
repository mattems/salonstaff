import { AUTH_PATH, signInWithoutCode } from "@salonstaff/auth";
import { codeLimits } from "@salonstaff/db";
import { LIMITS } from "@salonstaff/shared";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../env";
import { authConfig, isLocal } from "../lib/auth-config";
import { localNumberRefused, mayReach } from "../lib/verify";

export const auth = new Hono<AppEnv>();

const LIMITED = new Set([
  "/email-otp/send-verification-otp",
  "/phone-number/send-otp",
  "/sign-in/email-otp",
  "/phone-number/verify",
]);

/**
 * The only Better Auth endpoints anyone can reach: the ones the website and the app call.
 * Everything else the library registers is a 404, whatever a later version adds. That includes
 * its password routes (there are no passwords: `/email-otp/reset-password` and
 * `/sign-in/phone-number` would make one), and the routes with an audited /v1/me equivalent:
 * changing the email (/v1/me/email), the mobile (/v1/me/mobile: `updatePhoneNumber` on
 * /phone-number/verify is refused below), the name (PATCH /v1/me), sessions (/v1/me/sessions) and
 * disconnecting Google or Apple (/v1/me/sign-in-methods). `update-user` would also let someone
 * set their own role.
 */
export const ALLOWED = new Set([
  "/sign-in/social",
  "/link-social",
  "/sign-in/email-otp",
  "/email-otp/send-verification-otp",
  "/phone-number/send-otp",
  "/phone-number/verify",
  "/get-session",
  "/sign-out",
  "/error",
  "/ok",
]);
/** Where Google and Apple send people back. */
const CALLBACK = /^\/callback\/(google|apple)$/;

/** Sending and checking codes share one per-IP limit, wherever they're asked for. */
export async function withinCodeLimit(c: Context<AppEnv>): Promise<boolean> {
  if (c.env.ENVIRONMENT === "local" && c.env.RATE_LIMITS === "off") return true;
  const key = `auth:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;
  return (await c.env.AUTH_RATE_LIMITER.limit({ key })).success;
}

/**
 * Whether one more code may go to this email or mobile: only so many an hour and a day from one
 * caller, and a higher number from everyone together (`codeLimits`). Counts it when allowed.
 */
export async function withinDestinationLimit(
  c: Context<AppEnv>,
  destination: string,
): Promise<boolean> {
  if (c.env.ENVIRONMENT === "local" && c.env.RATE_LIMITS === "off") return true;
  const limits = codeLimits(await c.get("db")());
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  // From everyone together first (it isn't counted against the caller if that's what stops it).
  const all = await limits.allow(destination, {
    perHour: LIMITS.otpDestinationPerHour,
    perDay: LIMITS.otpDestinationPerDay,
  });
  return all && limits.allow(`${destination}|ip:${ip}`);
}

const tooMany = (c: Context<AppEnv>) =>
  c.json({ code: "rate_limited", message: "Too many attempts. Wait a while and try again." }, 429);

/**
 * Local development only: sign in as a demo person without a code. Anywhere else it 404s.
 * The springboard lists the demo accounts.
 */
auth.post(`${AUTH_PATH}/dev-login`, async (c) => {
  if (!isLocal(c.env)) return c.notFound();
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
  const role = body.role === "employer" ? "employer" : "seeker";
  const email =
    body.email ?? (role === "employer" ? "owner1@salonstaff.test" : "seeker@salonstaff.test");
  const cookie = await signInWithoutCode(
    await authConfig(c, await c.get("db")()),
    { email, name: "", role },
    { ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent") },
  );
  c.header("Set-Cookie", cookie, { append: true });
  // The mobile app signs in with the same session as a bearer token (the cookie's signed value).
  const token = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1, cookie.indexOf(";")));
  return c.json({ signed_in: true, token });
});

/**
 * Every other sign-in endpoint is Better Auth's. A request may arrive as /v1/auth/… (directly,
 * from the mobile app) or as /api/v1/auth/… on the website; Better Auth routes on its public
 * address, so the request is rewritten to that before handing it over.
 */
auth.on(["GET", "POST"], `${AUTH_PATH}/*`, async (c) => {
  const rest = new URL(c.req.url).pathname.slice(AUTH_PATH.length);
  if (!ALLOWED.has(rest) && !CALLBACK.test(rest)) return c.notFound();
  if (c.req.method === "POST" && LIMITED.has(rest)) {
    const body = (await c.req.raw
      .clone()
      .json()
      .catch(() => ({}))) as {
      updatePhoneNumber?: unknown;
      type?: unknown;
      email?: unknown;
      phoneNumber?: unknown;
    };
    // Changing the mobile goes through the audited POST /v1/me/mobile/confirm (D-13).
    if (rest === "/phone-number/verify" && body.updatePhoneNumber) return c.notFound();
    // Only sign-in codes: the library's other kinds are for passwords and its own email check.
    if (rest === "/email-otp/send-verification-otp" && body.type !== "sign-in") return c.notFound();
    if (!(await withinCodeLimit(c))) return tooMany(c);
    const destination =
      rest === "/email-otp/send-verification-otp"
        ? body.email
        : rest === "/phone-number/send-otp"
          ? body.phoneNumber
          : undefined;
    if (typeof destination === "string" && !(await withinDestinationLimit(c, destination)))
      return tooMany(c);
    // Locally with Twilio Verify, only your own numbers get a real text (D-23).
    if (
      rest === "/phone-number/send-otp" &&
      typeof destination === "string" &&
      c.get("phoneVerify")() &&
      !mayReach(c.env, destination)
    ) {
      throw localNumberRefused(destination);
    }
  }
  // The app signs in with an ID token from Apple or Google. Each is taken once: a token someone
  // got hold of (from a log, a proxy) can't be played again while it's still valid.
  if (c.req.method === "POST" && rest === "/sign-in/social") {
    const body = (await c.req.raw
      .clone()
      .json()
      .catch(() => ({}))) as { idToken?: { token?: unknown } };
    const token = body.idToken?.token;
    if (typeof token === "string" && token) {
      const fresh = await codeLimits(await c.get("db")()).allow(`id-token:${token}`, {
        perHour: 1,
        perDay: 1,
      });
      if (!fresh) {
        return c.json(
          { code: "token_used", message: "That sign-in was already used. Sign in again." },
          401,
        );
      }
    }
  }
  const config = await authConfig(c, await c.get("db")());
  const publicUrl = new URL(`${config.baseUrl}${rest}${new URL(c.req.url).search}`);
  const handler = await c.get("auth")();
  return handler.handler(new Request(publicUrl, c.req.raw));
});
