import { createRoute, z } from "@hono/zod-openapi";
import { myPushDevice } from "@salonstaff/db";
import { userActor } from "../lib/actor";
import { createRouter } from "../lib/router";
import { Deleted, errors, json, jsonBody } from "../lib/schemas";
import { requireUser } from "../lib/session";

/** Push notifications to the app (D-15): the phone you're signed in on. */
export const pushRoutes = createRouter();

const TAGS = ["Push notifications"];

const PushDeviceSchema = z
  .object({
    platform: z.literal("ios"),
    token: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{64,200}$/, "Apple's device token, in hex")
      .transform((token) => token.toLowerCase())
      .openapi({ example: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90" }),
    sandbox: z.boolean().default(false).openapi({
      description: "True for a development build: its token only works with Apple's sandbox.",
    }),
  })
  .openapi("PushDevice");

const RegisteredSchema = z.object({ registered: z.literal(true) }).openapi("PushDeviceRegistered");

pushRoutes.openapi(
  createRoute({
    method: "put",
    path: "/v1/me/push-device",
    summary: "Get push notifications on this phone",
    description:
      "Send the phone's push token after signing in, and again on every launch (tokens can change). It belongs to the session you send it with: signing out stops the pushes. The same notices go by email too.",
    tags: TAGS,
    request: jsonBody(PushDeviceSchema),
    responses: {
      200: json(RegisteredSchema, "Pushes will come to this phone"),
      400: errors[400],
      401: errors[401],
    },
  }),
  async (c) => {
    const { user, session } = await requireUser(c);
    const device = c.req.valid("json");
    if (!c.get("dryRun")) {
      await myPushDevice(await c.get("db")(), user.id, session.id).register(
        device,
        userActor(c, user.id),
      );
    }
    return c.json({ registered: true as const }, 200);
  },
);

pushRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/push-device",
    summary: "Stop push notifications on this phone",
    description: "Signing out stops them too. Notices still go by email.",
    tags: TAGS,
    responses: { 200: json(Deleted, "No more pushes to this phone"), 401: errors[401] },
  }),
  async (c) => {
    const { user, session } = await requireUser(c);
    if (!c.get("dryRun")) {
      await myPushDevice(await c.get("db")(), user.id, session.id).remove(userActor(c, user.id));
    }
    return c.json({ deleted: true as const }, 200);
  },
);
