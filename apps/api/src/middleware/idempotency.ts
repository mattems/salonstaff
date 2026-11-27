import { AUTH_PATH } from "@salonstaff/auth";
import { schema } from "@salonstaff/db";
import { ApiError } from "@salonstaff/shared";
import { and, eq, lt } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { actorKey } from "../lib/actor";
import { loggedPath } from "./request-context";

const { idempotencyKeys } = schema;
const TTL_MS = 24 * 60 * 60 * 1000;
const KEY_RE = /^[\x21-\x7e]{1,255}$/;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Not kept for replay: the response said so. */
const WITHHELD = null;

/**
 * A `POST` sent with an `Idempotency-Key` runs once. Sending it again with
 * the same key and body returns the first response instead of repeating the
 * action, so clients and agents can retry safely after a timeout.
 *
 * A response marked `Cache-Control: no-store` carries something shown once (a new API
 * token, a signing secret), so its body is never written down: a retry is told the request
 * already succeeded. The auth library's routes are left alone; they manage their own.
 */
export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (c.req.method !== "POST" || key === undefined || c.get("dryRun")) return next();
    if (c.req.path.startsWith(`${AUTH_PATH}/`)) return next();
    // The admin portal doesn't use keys, and a stored answer would be replayed before the staff
    // gate runs: staff have no session to scope it to.
    if (c.req.path.startsWith("/admin/")) return next();

    if (!KEY_RE.test(key)) {
      throw new ApiError("validation_failed", {
        detail: "The Idempotency-Key header is not valid",
        hint: "Use 1 to 255 printable ASCII characters with no spaces, for example a UUID.",
        errors: [{ path: "Idempotency-Key", message: "Must be 1-255 printable ASCII characters" }],
      });
    }

    // Scoped to whoever is calling, so two callers can't collide on the same key.
    const session = await c.get("session")();
    const caller = session ? `user:${session.user.id}` : actorKey(c);
    // The path is stored with its secrets masked (a claim or invite token), and the whole path
    // is part of the fingerprint instead, so one key still means one exact request.
    const scope = `${caller} ${c.req.method} ${loggedPath(c.req.path)}`;
    const fingerprint = await sha256(`${c.req.path}\n${await c.req.raw.clone().text()}`);
    const db = await c.get("db")();
    const row = and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));
    const now = new Date();

    await db.delete(idempotencyKeys).where(and(row, lt(idempotencyKeys.expiresAt, now)));
    const claimed = await db
      .insert(idempotencyKeys)
      .values({ scope, key, fingerprint, expiresAt: new Date(now.getTime() + TTL_MS) })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });

    if (claimed.length === 0) {
      const [existing] = await db.select().from(idempotencyKeys).where(row);
      if (!existing || existing.responseStatus === null) {
        throw new ApiError("idempotency_in_progress", {
          hint: "The first request with this key has not finished. Wait a moment and send it again.",
        });
      }
      if (existing.fingerprint !== fingerprint) {
        throw new ApiError("idempotency_key_reused", {
          detail: "This Idempotency-Key was already used with a different request body",
          hint: "Use a new key for a new request. Reuse a key only to retry the exact same request.",
        });
      }
      if (existing.responseBody === WITHHELD) {
        throw new ApiError("idempotency_not_replayable", {
          detail:
            "The first request with this key succeeded, and its answer held a secret that is shown only once",
          hint: "The thing was created. If you didn't record the secret, revoke or replace it and make a new one.",
        });
      }
      return c.body(existing.responseBody, existing.responseStatus as 200, {
        "Content-Type": existing.responseContentType ?? "application/json",
        "Idempotent-Replayed": "true",
      });
    }

    await next();

    // A server error is not a result worth replaying: release the key so a retry runs again.
    if (c.res.status >= 500) {
      await db.delete(idempotencyKeys).where(row);
      return;
    }
    const noStore = c.res.headers.get("Cache-Control")?.includes("no-store") ?? false;
    await db
      .update(idempotencyKeys)
      .set({
        responseStatus: c.res.status,
        responseBody: noStore ? WITHHELD : await c.res.clone().text(),
        responseContentType: c.res.headers.get("Content-Type"),
      })
      .where(row);
  };
}
