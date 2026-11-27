import { connect } from "@salonstaff/db";
import { createApp } from "./app";
import type { Env } from "./env";
import { housekeeping } from "./lib/housekeeping";

/** Durable Objects the Worker hosts (wrangler.jsonc `durable_objects`). */
export { ConversationRoom } from "./live/conversation-room";

const app = createApp();

export default {
  /**
   * The website forwards `/api/*` here over a service binding (its own origin keeps the session
   * cookie simple); api.salonstaff.com.au and the admin portal call `/v1/*` and `/admin/v1/*`
   * directly. Both arrive at the same routes.
   */
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      url.pathname = url.pathname.slice(4) || "/";
      return app.fetch(new Request(url, request), env, ctx);
    }
    return app.fetch(request, env, ctx);
  },

  /** Daily clean-up (wrangler.jsonc `triggers`). */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const { db, close } = await connect(env.HYPERDRIVE.connectionString);
    ctx.waitUntil(
      housekeeping(db, env)
        // A failed clean-up is an event to alert on, not a stray rejection.
        .catch((error: unknown) =>
          console.error(
            JSON.stringify({
              level: "error",
              event: "housekeeping_failed",
              message: error instanceof Error ? error.message : String(error),
            }),
          ),
        )
        .finally(() => close()),
    );
  },
} satisfies ExportedHandler<Env>;
