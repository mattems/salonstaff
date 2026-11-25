import type { DbTimings } from "@salonstaff/db";
import { newId } from "@salonstaff/shared";
import type { MiddlewareHandler } from "hono";
import { setMetric } from "hono/timing";
import type { AppEnv } from "../env";

export interface RequestTimings {
  db: DbTimings;
  /**
   * Working out who is calling: the session or token lookup. Usually the request's first
   * query, so it includes opening the database connection.
   */
  authMs: number | null;
}

// False only for the first request a Worker instance serves, which paid for its start-up.
let warm = false;

/** A secret that travels in the path is not written to the log. */
export function loggedPath(path: string): string {
  // Claim links carry a one-time token: never log it.
  return path.replace(/^(\/v1\/claims\/verify\/)[^/]+/, "$1:token");
}

const round = (ms: number | null) => (ms === null ? null : Math.round(ms));

/**
 * Gives every request an ID, returns it in `X-Request-Id`, and writes one structured log line
 * with what the request spent its time on (also in `Server-Timing`, outside production).
 */
export function requestContext(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = newId("request");
    const startedAt = Date.now();
    const cold = !warm;
    warm = true;
    const timings: RequestTimings = { db: { queries: 0 }, authMs: null };
    c.set("requestId", requestId);
    c.set("timings", timings);
    await next();
    if (timings.authMs !== null) setMetric(c, "auth", timings.authMs);
    setMetric(c, "db", `${timings.db.queries} queries`);
    if (cold) setMetric(c, "cold-start");
    c.header("X-Request-Id", requestId);
    // Only production should ever appear in search results.
    if ((c.env.ENVIRONMENT ?? "production") !== "production") {
      c.header("X-Robots-Tag", "noindex, nofollow");
    }
    const status = c.res.status;
    console.log(
      JSON.stringify({
        level: status >= 500 ? "error" : "info",
        event: "request",
        request_id: requestId,
        method: c.req.method,
        path: loggedPath(c.req.path),
        status,
        duration_ms: Date.now() - startedAt,
        auth_ms: round(timings.authMs),
        db_queries: timings.db.queries,
        cold_start: cold,
      }),
    );
  };
}
