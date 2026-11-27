import { AUTH_PATH, signInWithoutCode } from "@salonstaff/auth";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../env";
import { authConfig, isLocal } from "../lib/auth-config";

export const auth = new Hono<AppEnv>();

const LIMITED = new Set([
  "/email-otp/send-verification-otp",
  "/phone-number/send-otp",
  "/sign-in/email-otp",
  "/phone-number/verify",
]);

/**
 * Better Auth endpoints with an audited /v1/me route instead: changing the email (/v1/me/email),
 * the mobile (/v1/me/mobile: `updatePhoneNumber` on /phone-number/verify is refused below),
 * the name (PATCH /v1/me), sessions (/v1/me/sessions) and disconnecting Google or Apple
 * (/v1/me/sign-in-methods). `update-user` would also let someone set their own role.
 */
const HIDDEN = new Set([
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  "/change-email",
  "/update-user",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/unlink-account",
]);

/** Sending and checking codes share one per-IP limit, wherever they're asked for. */
export async function withinCodeLimit(c: Context<AppEnv>): Promise<boolean> {
  if (c.env.ENVIRONMENT === "local" && c.env.RATE_LIMITS === "off") return true;
  const key = `auth:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;
  return (await c.env.AUTH_RATE_LIMITER.limit({ key })).success;
}

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
  if (HIDDEN.has(rest)) return c.notFound();
  // Changing the mobile goes through the audited POST /v1/me/mobile/confirm (D-13).
  if (c.req.method === "POST" && rest === "/phone-number/verify") {
    const body = (await c.req.raw
      .clone()
      .json()
      .catch(() => ({}))) as { updatePhoneNumber?: unknown };
    if (body.updatePhoneNumber) return c.notFound();
  }
  if (c.req.method === "POST" && LIMITED.has(rest) && !(await withinCodeLimit(c)))
    return c.json(
      { code: "rate_limited", message: "Too many attempts. Wait a minute and try again." },
      429,
    );
  const config = await authConfig(c, await c.get("db")());
  const publicUrl = new URL(`${config.baseUrl}${rest}${new URL(c.req.url).search}`);
  const handler = await c.get("auth")();
  return handler.handler(new Request(publicUrl, c.req.raw));
});
