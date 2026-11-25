import type { Actor } from "@salonstaff/db";
import type { Context } from "hono";
import type { AppEnv } from "../env";

/** A stable key for whoever is calling, for rate limits and idempotency keys. */
export function actorKey(c: Context<AppEnv>): string {
  return `ip:${c.req.header("CF-Connecting-IP") ?? "unknown"}`;
}

export function allowedOrigins(c: Context<AppEnv>): string[] {
  return c.env.APP_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** The signed-in person, as the audit log records them. */
export function userActor(c: Context<AppEnv>, userId: string): Actor {
  return {
    type: "user",
    id: userId,
    ip: c.req.header("CF-Connecting-IP"),
    requestId: c.get("requestId"),
  };
}
