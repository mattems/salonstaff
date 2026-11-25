import { connect, type DbConnection } from "@salonstaff/db";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

/**
 * Makes `c.get("db")()` available. The connection opens the first time a
 * handler asks for it and closes after the response is sent, so requests
 * that never touch the database never connect.
 */
export function database(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let connection: Promise<DbConnection> | undefined;
    c.set("db", async () => {
      connection ??= connect(c.env.HYPERDRIVE.connectionString, { timings: c.get("timings").db });
      return (await connection).db;
    });
    try {
      await next();
    } finally {
      if (connection) {
        c.executionCtx.waitUntil(connection.then((open) => open.close()).catch(() => {}));
      }
    }
  };
}
