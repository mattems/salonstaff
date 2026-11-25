import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

/**
 * `?dry_run=true` on a change asks "what would happen?" without doing it.
 * Handlers read `c.get("dryRun")`, validate as usual and skip the write.
 */
export function dryRun(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requested = c.req.method !== "GET" && c.req.query("dry_run") === "true";
    c.set("dryRun", requested);
    await next();
    if (requested) c.header("Dry-Run", "true");
  };
}
