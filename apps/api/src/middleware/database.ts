import { connect, type DbConnection } from "@salonstaff/db";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

/**
 * Makes `c.get("db")()` available. The connection opens the first time a
 * handler asks for it and closes after the response is sent, so requests
 * that never touch the database never connect.
 *
 * Also `c.get("background")(task)`: work that runs on after the response (sending notices) and
 * may still use the database. The connection closes once it has all finished.
 */
export function database(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let connection: Promise<DbConnection> | undefined;
    const tasks: Promise<unknown>[] = [];
    c.set("db", async () => {
      connection ??= connect(c.env.HYPERDRIVE.connectionString, { timings: c.get("timings").db });
      return (await connection).db;
    });
    c.set("background", (task) => {
      tasks.push(task);
    });
    try {
      await next();
    } finally {
      c.executionCtx.waitUntil(
        (async () => {
          await Promise.allSettled(tasks);
          if (connection) await (await connection).close();
        })().catch(() => {}),
      );
    }
  };
}
