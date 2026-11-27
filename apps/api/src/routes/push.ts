import { createRoute, z } from "@hono/zod-openapi";
import { myPushDevice, notificationSettings } from "@salonstaff/db";
import { NOTIFICATION_TOPICS, notificationPreferencesSchema } from "@salonstaff/shared";
import { userActor } from "../lib/actor";
import { pushesReachPhones } from "../lib/push";
import { createRouter } from "../lib/router";
import { Deleted, errors, json, jsonBody } from "../lib/schemas";
import { requireUser } from "../lib/session";

/** Notifications (D-15): what you hear about, and push to the phone you're signed in on. */
export const pushRoutes = createRouter();

const TAGS = ["Notifications"];

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

const RegisteredSchema = z
  .object({
    registered: z.literal(true),
    delivered: z.boolean().openapi({
      description:
        "Whether pushes actually reach phones. `false` when the API can't send them (locally, without an APNs key): watch for news another way, such as checking `GET /v1/me` now and then.",
    }),
  })
  .openapi("PushDeviceRegistered");

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
    return c.json({ registered: true as const, delivered: pushesReachPhones(c.env) }, 200);
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

const topics = NOTIFICATION_TOPICS.map((t) => `\`${t.value}\` (${t.label.toLowerCase()})`).join(
  ", ",
);

const Channels = z.object({
  push: z.boolean().openapi({ description: "A push to your phones with the app" }),
  email: z.boolean().openapi({ description: "An email, or a text if your account has no email" }),
});
const NotificationPreferencesSchema = z
  .object({ messages: Channels, applications: Channels, account: Channels })
  .openapi("NotificationPreferences", {
    example: {
      messages: { push: true, email: true },
      applications: { push: true, email: false },
      account: { push: false, email: true },
    },
  });

pushRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/notifications",
    summary: "What you're told about",
    description: `Push and email, on or off, for each topic: ${topics}. Everything is on until you switch it off. Sign-in and security notices, and notices about a salon you manage, always go.`,
    tags: TAGS,
    responses: {
      200: json(NotificationPreferencesSchema, "Your choices"),
      401: errors[401],
    },
  }),
  async (c) => {
    const { user } = await requireUser(c);
    return c.json(await notificationSettings(await c.get("db")(), user.id).get(), 200);
  },
);

pushRoutes.openapi(
  createRoute({
    method: "put",
    path: "/v1/me/notifications",
    summary: "Choose what you're told about",
    description:
      "Every topic, with `push` and `email`. Email also covers a text when your account has no email.",
    tags: TAGS,
    request: jsonBody(notificationPreferencesSchema),
    responses: {
      200: json(NotificationPreferencesSchema, "Your choices now"),
      400: errors[400],
      401: errors[401],
    },
  }),
  async (c) => {
    const { user } = await requireUser(c);
    const input = c.req.valid("json");
    if (c.get("dryRun")) return c.json(input, 200);
    const saved = await notificationSettings(await c.get("db")(), user.id).save(
      input,
      userActor(c, user.id),
    );
    return c.json(saved, 200);
  },
);
