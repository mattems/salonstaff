import { ApiError } from "@salonstaff/shared";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "../env";
import { allowedOrigins } from "../lib/actor";

/**
 * Browsers may call the API only from our own web apps (the website mostly calls it
 * same-origin through its /api proxy). The admin API answers the admin portal alone.
 */
export function corsPolicy(): MiddlewareHandler<AppEnv> {
  const forApps = appCors(true, allowedOrigins);
  const forAdmin = appCors(true, (c) => (c.env.ADMIN_ORIGIN ? [c.env.ADMIN_ORIGIN] : []));
  return (c, next) =>
    new URL(c.req.url).pathname.startsWith("/admin/") ? forAdmin(c, next) : forApps(c, next);
}

function appCors(
  credentials: boolean,
  origins: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string[],
): MiddlewareHandler<AppEnv> {
  return cors({
    origin: (origin, c) => (origins(c).includes(origin) ? origin : null),
    credentials,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    exposeHeaders: [
      "X-Request-Id",
      "RateLimit-Policy",
      "Retry-After",
      "Idempotent-Replayed",
      "Dry-Run",
    ],
    maxAge: 600,
  });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Routes that never read who is signed in. Nothing under it may call `requireWorkspace`. */
export const PUBLIC_PATH = "/v1/public/";
/** Apple posts its sign-in answer from its own origin; Better Auth checks it. Stripe signs its webhooks. */
const EXEMPT_PATHS = ["/v1/auth/callback/apple", "/v1/webhooks/"];

/**
 * Cross-site request forgery guard. A change made with a session cookie must
 * come from one of our own origins. Requests that authenticate with a token
 * carry no cookie authority, so they are exempt.
 */
export function originCheck(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const usesCookie = c.req.header("Cookie") !== undefined;
    const usesToken = c.req.header("Authorization")?.startsWith("Bearer ") ?? false;
    // Public routes act with nobody's authority, so there is no session to forge a request against.
    const path = new URL(c.req.url).pathname;
    const isPublic = path.startsWith(PUBLIC_PATH);
    const isExempt = EXEMPT_PATHS.some((prefix) => path.startsWith(prefix));
    if (!SAFE_METHODS.has(c.req.method) && usesCookie && !usesToken && !isPublic && !isExempt) {
      const origin = c.req.header("Origin");
      if (!origin || !allowedOrigins(c).includes(origin)) {
        throw new ApiError("forbidden", {
          detail: "This request did not come from an allowed origin",
          hint: "Call the API from the website, or sign in with a bearer token (the mobile app).",
        });
      }
    }
    await next();
  };
}
