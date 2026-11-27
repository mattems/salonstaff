/**
 * Staff passkeys and the confirmations made with them. These join
 * the other admin routes: each starts with `requireStaff`.
 */
import { createRoute, z } from "@hono/zod-openapi";
import type { StaffPasskey } from "@salonstaff/db";
import { ApiError, decodeId, encodeId, STAFF_CONFIRMED_ACTIONS } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { problemResponse } from "../lib/openapi";
import {
  Confirmation,
  finishRegistration,
  requireConfirmation,
  startConfirmation,
  startRegistration,
} from "../lib/staff-confirmation";
import { requireStaff, type StaffContext } from "../lib/staff-context";
import { admin, findStaff } from "./admin";

/** Every staff role has this: a passkey is your own, whatever else you may do. */
const ANYONE = "audit:read";

/**
 * Registering a passkey can't be tried out: a dry run skips the passkey confirmation, and the
 * registration it started would be a real one.
 */
function refuseDryRun(c: Context<AppEnv>) {
  if (!c.get("dryRun")) return;
  throw new ApiError("validation_failed", {
    detail: "Registering a passkey can't be tried out",
    hint: "Send the request without dry_run.",
  });
}

const Passkey = z
  .object({
    id: z.string().openapi({ example: "pk_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string().openapi({ example: "MacBook" }),
    added_at: z.string(),
    last_used_at: z.string().nullable(),
  })
  .openapi("AdminPasskey");
const Name = z.string().trim().min(1).max(60);
const Reason = z.string().trim().min(3).max(500);
// What the browser's WebAuthn call takes and gives. Its shape is the standard's, not ours.
const WebAuthn = z.record(z.string(), z.unknown());
const wire = (options: object) => options as Record<string, never>;

const IdParams = z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) });
const ok = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  content: { "application/json": { schema } },
  required: true,
});
const errors = {
  403: problemResponse(
    "Not staff, the staff role does not allow this, or it needs confirming with a passkey (`confirmation_required`)",
  ),
};
const notFound = { 404: problemResponse("Nothing with that ID") };

const passkeyJson = (passkey: StaffPasskey) => ({
  id: encodeId("passkey", passkey.id),
  name: passkey.name,
  added_at: passkey.createdAt.toISOString(),
  last_used_at: passkey.lastUsedAt?.toISOString() ?? null,
});

async function findPasskey(c: Context<AppEnv>, { staff, data }: StaffContext) {
  const id = decodeId("passkey", c.req.param("id") ?? "");
  const passkey = id ? await data.passkeys.find(staff.id, id) : null;
  if (!passkey) {
    throw new ApiError("not_found", {
      detail: "You have no passkey with that ID",
      hint: "List yours with GET /admin/v1/passkeys and use an `id` from there.",
    });
  }
  return passkey;
}

admin.openapi(
  createRoute({
    method: "post",
    path: "/admin/v1/confirmations",
    summary: "Ask to confirm an action with your passkey",
    description:
      "Returns a challenge for one action on one target. Have the passkey answer it, and send the answer as `confirmation` with the change itself. It works once and lasts two minutes. `can_skip` is true only in local development, where the change may be sent with `confirmation: { skip: true }` instead; `id` and `options` are then null for someone with no passkey.",
    tags: ["Admin"],
    request: {
      body: body(
        z.object({
          action: z.enum(STAFF_CONFIRMED_ACTIONS),
          target: z.string().min(1).max(200).openapi({
            description: "The ID or code of what is being changed, or `new` when adding something.",
          }),
        }),
      ),
    },
    responses: {
      200: ok(
        z.object({
          id: z.string().nullable(),
          options: WebAuthn.nullable(),
          can_skip: z.boolean(),
        }),
        "The challenge",
      ),
      ...errors,
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, ANYONE);
    const { action, target } = c.req.valid("json");
    const started = await startConfirmation(c, ctx, action, target);
    return c.json(
      {
        id: started.id as string | null,
        options: started.options ? wire(started.options) : null,
        can_skip: started.can_skip,
      },
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/passkeys",
    summary: "List your passkeys",
    tags: ["Admin"],
    responses: { 200: ok(z.object({ data: z.array(Passkey) }), "Oldest first"), ...errors },
  }),
  async (c) => {
    const { staff, data } = await requireStaff(c, ANYONE);
    return c.json({ data: (await data.passkeys.list(staff.id)).map(passkeyJson) }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: "/admin/v1/passkeys/options",
    summary: "Start registering a passkey",
    description:
      "Your first passkey needs nothing more. Once you have one, adding another must be confirmed with it (action `passkey.add`, target `new`).",
    tags: ["Admin"],
    request: { body: body(z.object({ confirmation: Confirmation })) },
    responses: {
      200: ok(z.object({ id: z.string(), options: WebAuthn }), "What to give the browser"),
      ...errors,
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, ANYONE);
    refuseDryRun(c);
    if ((await ctx.data.passkeys.list(ctx.staff.id)).length > 0) {
      await requireConfirmation(c, ctx, "passkey.add", "new", c.req.valid("json").confirmation);
    }
    const { id, options } = await startRegistration(c, ctx);
    return c.json({ id, options: wire(options) }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: "/admin/v1/passkeys",
    summary: "Finish registering a passkey",
    tags: ["Admin"],
    request: { body: body(z.object({ id: z.string(), name: Name, response: WebAuthn })) },
    responses: {
      201: ok(Passkey, "The new passkey"),
      ...errors,
      409: problemResponse("The registration expired, or the passkey is already registered"),
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, ANYONE);
    refuseDryRun(c);
    return c.json(passkeyJson(await finishRegistration(c, ctx, c.req.valid("json"))), 201);
  },
);

admin.openapi(
  createRoute({
    method: "patch",
    path: "/admin/v1/passkeys/{id}",
    summary: "Rename a passkey",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ name: Name })) },
    responses: { 200: ok(Passkey, "The passkey"), ...errors, ...notFound },
  }),
  async (c) => {
    const ctx = await requireStaff(c, ANYONE);
    const passkey = await findPasskey(c, ctx);
    const { name } = c.req.valid("json");
    if (c.get("dryRun")) return c.json(passkeyJson({ ...passkey, name }), 200);
    return c.json(passkeyJson(await ctx.data.passkeys.rename(passkey, name, ctx.actor)), 200);
  },
);

admin.openapi(
  createRoute({
    method: "delete",
    path: "/admin/v1/passkeys/{id}",
    summary: "Remove a passkey",
    description:
      "Must be confirmed with one of your passkeys, which can be this one (action `passkey.remove`, target its ID).",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ confirmation: Confirmation })) },
    responses: {
      200: ok(z.object({ removed: z.boolean() }), "It is gone"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, ANYONE);
    const passkey = await findPasskey(c, ctx);
    const actor = await requireConfirmation(
      c,
      ctx,
      "passkey.remove",
      encodeId("passkey", passkey.id),
      c.req.valid("json").confirmation,
    );
    if (c.get("dryRun")) return c.json({ removed: true }, 200);
    await ctx.data.passkeys.remove(passkey, actor);
    return c.json({ removed: true }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "delete",
    path: "/admin/v1/staff/{id}/passkeys",
    summary: "Reset a staff member's passkeys",
    description:
      "For someone who has lost theirs: removes them all, so they can register a new one. Must be confirmed with your own passkey (action `staff.reset_passkeys`, target their ID). You can't reset your own.",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(z.object({ reason: Reason, confirmation: Confirmation })),
    },
    responses: {
      200: ok(z.object({ removed: z.number().int() }), "How many were removed"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "staff:manage");
    const member = await findStaff(c, ctx.data);
    const { reason, confirmation } = c.req.valid("json");
    if (member.id === ctx.staff.id) {
      throw new ApiError("forbidden", {
        detail: "You can't reset your own passkeys",
        hint: "Remove them one at a time on the Passkeys screen, or ask another owner.",
      });
    }
    const actor = await requireConfirmation(
      c,
      ctx,
      "staff.reset_passkeys",
      encodeId("staff", member.id),
      confirmation,
    );
    if (c.get("dryRun")) {
      return c.json({ removed: (await ctx.data.passkeys.list(member.id)).length }, 200);
    }
    const removed = await ctx.data.passkeys.reset(member, reason, actor);
    return c.json({ removed }, 200);
  },
);
