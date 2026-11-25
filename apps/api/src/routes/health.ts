import { connect, ping } from "@salonstaff/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { rateLimit } from "../middleware/rate-limit";

export const health = new Hono<AppEnv>();

/** The Worker is running. */
health.get("/livez", (c) => c.json({ status: "ok" }));

/** The Worker can reach its database. */
health.use("/readyz", rateLimit());
health.get("/readyz", async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    const { db, close } = await connect(c.env.HYPERDRIVE.connectionString);
    try {
      await ping(db);
    } finally {
      c.executionCtx.waitUntil(close().catch(() => {}));
    }
    return c.json({ status: "ok" });
  } catch (error) {
    console.error(JSON.stringify({ event: "readyz_failed", message: (error as Error).message }));
    return c.json({ status: "unavailable" }, 503);
  }
});
