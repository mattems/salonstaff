import { AUTH_PATH, signInWithoutCode } from "@salonstaff/auth";
import { Hono } from "hono";
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
 * Local development only: sign in as a demo person without a code. Anywhere else it 404s.
 * The springboard lists the demo accounts.
 */
auth.post(`${AUTH_PATH}/dev-login`, async (c) => {
  if (!isLocal(c.env)) return c.notFound();
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
  const role = body.role === "employer" ? "employer" : "seeker";
  const email =
    body.email ?? (role === "employer" ? "owner1@salonstaff.test" : "seeker@salonstaff.test");
  const cookie = await signInWithoutCode(await authConfig(c, await c.get("db")()), {
    email,
    name: "",
    role,
  });
  c.header("Set-Cookie", cookie, { append: true });
  return c.json({ signed_in: true });
});

/**
 * Every other sign-in endpoint is Better Auth's. A request may arrive as /v1/auth/… (directly,
 * from the mobile app) or as /api/v1/auth/… on the website; Better Auth routes on its public
 * address, so the request is rewritten to that before handing it over.
 */
auth.on(["GET", "POST"], `${AUTH_PATH}/*`, async (c) => {
  const rest = new URL(c.req.url).pathname.slice(AUTH_PATH.length);
  if (c.req.method === "POST" && LIMITED.has(rest)) {
    const key = `auth:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;
    const allowed =
      c.env.ENVIRONMENT === "local" && c.env.RATE_LIMITS === "off"
        ? true
        : (await c.env.AUTH_RATE_LIMITER.limit({ key })).success;
    if (!allowed)
      return c.json(
        { code: "rate_limited", message: "Too many attempts. Wait a minute and try again." },
        429,
      );
  }
  const config = await authConfig(c, await c.get("db")());
  const publicUrl = new URL(`${config.baseUrl}${rest}${new URL(c.req.url).search}`);
  const handler = await c.get("auth")();
  return handler.handler(new Request(publicUrl, c.req.raw));
});
