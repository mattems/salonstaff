import { ApiError } from "@salonstaff/shared";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { actorKey } from "../lib/actor";

/** Must match the `ratelimits` entry in wrangler.jsonc. */
export const RATE_LIMIT = { limit: 300, windowSeconds: 60 } as const;

/**
 * Per-caller rate limit using Cloudflare's rate limiting binding. The binding
 * only answers "allowed or not", so we publish the policy and a `Retry-After`
 * on rejection rather than a remaining-requests count.
 */
export function rateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // The browser tests drive several people's worth of screens from one address, faster than
    // any person would. They switch the limit off, which only a local API will agree to.
    if (c.env.ENVIRONMENT === "local" && c.env.RATE_LIMITS === "off") return next();
    c.header("RateLimit-Policy", `"default";q=${RATE_LIMIT.limit};w=${RATE_LIMIT.windowSeconds}`);
    const { success } = await c.env.RATE_LIMITER.limit({ key: actorKey(c) });
    if (!success) {
      c.header("Retry-After", String(RATE_LIMIT.windowSeconds));
      throw new ApiError("rate_limited", {
        detail: `More than ${RATE_LIMIT.limit} requests in ${RATE_LIMIT.windowSeconds} seconds`,
        hint: "Wait for the number of seconds in the Retry-After header, then try again.",
      });
    }
    await next();
  };
}
