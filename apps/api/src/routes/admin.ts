/**
 * The admin portal's API (admin.salonstaff.com.au). Every route starts with `requireStaff`;
 * dangerous changes also need a passkey confirmation (`requireConfirmation`). These routes and
 * their `Admin…` schemas are left out of the public API reference.
 *
 * Here: who am I, the overview, staff, the local staff picker and the audit log. People, salons,
 * the directory, jobs, payments, checks and claims add their routes from admin-*.ts.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { isStandInEmail } from "@salonstaff/auth";
import {
  type AuditRowWithNames,
  LastOwnerError,
  StaffExistsError,
  type StaffWithAdder,
} from "@salonstaff/db";
import {
  ApiError,
  decodeId,
  encodeId,
  ID_PREFIXES,
  type IdKind,
  STAFF_ROLE_PERMISSIONS,
  STAFF_ROLES,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { problemResponse } from "../lib/openapi";
import { decodeCursor, PaginationQuery, toPage } from "../lib/pagination";
import { createRouter } from "../lib/router";
import { Confirmation, requireConfirmation } from "../lib/staff-confirmation";
import { localStaff, requireStaff, type StaffContext } from "../lib/staff-context";

export const admin = createRouter();

export const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers shared by every admin-*.ts
// ---------------------------------------------------------------------------

export const Reason = z.string().trim().min(3).max(500);
export const IdParams = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

export const ok = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});
export const body = <T extends z.ZodType>(schema: T) => ({
  content: { "application/json": { schema } },
  required: true,
});
export const errors = {
  403: problemResponse(
    "Not through Cloudflare Access, not staff, the staff role does not allow this, or it needs confirming with a passkey (`confirmation_required`)",
  ),
};
export const notFound = { 404: problemResponse("Nothing with that ID") };

/** A query flag sent as `true` or `false`. */
export const QueryBoolean = z.enum(["true", "false"]).transform((value) => value === "true");

export const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;

/** The uuid behind a prefixed ID in the path, or a 404 that says where to find one. */
export function pathId(c: Context<AppEnv>, kind: IdKind, list: string): string {
  const id = decodeId(kind, c.req.param("id") ?? "");
  if (!id) {
    throw new ApiError("not_found", {
      detail: `No ${kind} with that ID`,
      hint: `List them with GET ${list} and use an \`id\` from there.`,
    });
  }
  return id;
}

export function missing(kind: string, list: string): never {
  throw new ApiError("not_found", {
    detail: `No ${kind} with that ID`,
    hint: `List them with GET ${list} and use an \`id\` from there.`,
  });
}

/** A page of rows fetched `limit + 1` at a time, keyed on their uuid. */
export function page<T, J>(
  rows: T[],
  limit: number,
  idOf: (row: T) => string,
  json: (row: T) => J,
) {
  const result = toPage(rows, limit, idOf);
  return { data: result.data.map(json), next_cursor: result.next_cursor };
}
export const Page = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), next_cursor: z.string().nullable() });

const KIND_BY_PREFIX = new Map<string, IdKind>(
  Object.entries(ID_PREFIXES).map(([kind, prefix]) => [prefix, kind as IdKind]),
);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Audit rows keep raw uuids; the API shows them prefixed when the target's kind has an ID kind. */
const TARGET_KINDS: Record<string, IdKind> = {
  user: "user",
  salon: "salon",
  job: "job",
  application: "application",
  check: "check",
  claim: "claim",
  flag: "flag",
  payment: "payment",
  staff: "staff",
};

function targetJson(type: string | null, id: string | null): string | null {
  const kind = type ? TARGET_KINDS[type] : undefined;
  return kind && id && UUID_RE.test(id) ? encodeId(kind, id) : id;
}

/** A prefixed ID of any kind (or a raw uuid) → the uuid an audit row stores, or null. */
function anyId(value: string): string | null {
  if (UUID_RE.test(value)) return value;
  const kind = KIND_BY_PREFIX.get(value.slice(0, value.lastIndexOf("_")));
  return kind ? decodeId(kind, value) : null;
}

// ---------------------------------------------------------------------------
// Who am I
// ---------------------------------------------------------------------------

const StaffMe = z
  .object({
    staff: z.object({ id: z.string(), name: z.string(), email: z.string() }),
    role: z.enum(STAFF_ROLES),
    permissions: z.array(z.string()),
  })
  .openapi("AdminMe");

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/me",
    summary: "The staff member Cloudflare Access let in",
    tags: ["Admin"],
    responses: { 200: ok(StaffMe, "Your staff role and what it allows"), ...errors },
  }),
  async (c) => {
    const { staff } = await requireStaff(c, "audit:read");
    return c.json(
      {
        staff: { id: encodeId("staff", staff.id), name: staff.name, email: staff.email },
        role: staff.role,
        permissions: [...STAFF_ROLE_PERMISSIONS[staff.role]],
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const Queues = z
  .object({
    pending_checks: z
      .number()
      .int()
      .openapi({ description: "Right-to-work and qualification checks waiting for a decision." }),
    pending_abn: z
      .number()
      .int()
      .openapi({ description: "Salons whose ABN waits for a staff check." }),
    pending_claims: z
      .number()
      .int()
      .openapi({ description: "Listing claims waiting for staff review." }),
  })
  .openapi("AdminQueues");

const Overview = z
  .object({
    seekers: z.number().int(),
    id_verified_seekers: z.number().int(),
    employers: z.number().int(),
    salons: z.object({
      total: z.number().int(),
      claimed: z.number().int(),
      unclaimed: z.number().int(),
    }),
    live_jobs: z.number().int(),
    applications: z.object({ week: z.number().int(), all: z.number().int() }),
    signups_week: z.number().int(),
    active_plans: z.number().int(),
    revenue_cents: z
      .number()
      .int()
      .openapi({ description: "Paid payments, all time, in Australian cents." }),
    queues: Queues,
    newest: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        role: z.enum(["seeker", "employer"]),
        created_at: z.string(),
      }),
    ),
  })
  .openapi("AdminOverview");

/** Mobile sign-ups have a stand-in address until they add a real one: shown as no email. */
export const realEmail = (email: string | null | undefined) =>
  email && !isStandInEmail(email) ? email : null;

const queuesJson = (q: { pendingChecks: number; pendingAbn: number; pendingClaims: number }) => ({
  pending_checks: q.pendingChecks,
  pending_abn: q.pendingAbn,
  pending_claims: q.pendingClaims,
});

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/overview",
    summary: "The numbers that matter, and what's waiting",
    tags: ["Admin"],
    responses: { 200: ok(Overview, "Counts and the newest accounts"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "users:read");
    const o = await data.overview();
    return c.json(
      {
        seekers: o.seekers,
        id_verified_seekers: o.idVerifiedSeekers,
        employers: o.employers,
        salons: o.salons,
        live_jobs: o.liveJobs,
        applications: o.applications,
        signups_week: o.signupsWeek,
        active_plans: o.activePlans,
        revenue_cents: o.revenueCents,
        queues: queuesJson(o),
        newest: o.newest.map((u) => ({
          id: encodeId("user", u.id),
          name: u.name,
          email: realEmail(u.email),
          role: u.role,
          created_at: u.createdAt.toISOString(),
        })),
      },
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/queues",
    summary: "What's waiting for staff",
    description: "The counts beside the portal's menu: checks, ABNs and claims to review.",
    tags: ["Admin"],
    responses: { 200: ok(Queues, "The counts"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "users:read");
    return c.json(queuesJson(await data.queues()), 200);
  },
);

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

const StaffMember = z
  .object({
    id: z.string().openapi({ example: "stf_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    email: z.string(),
    role: z.enum(STAFF_ROLES),
    is_you: z.boolean(),
    added_at: z.string(),
    added_by: z.string().nullable().openapi({ description: "Null when a script added them." }),
    last_seen_at: z.string().nullable(),
    passkeys: z.number().int().openapi({
      description:
        "How many passkeys they have. With none they can't confirm changes that need one.",
    }),
  })
  .openapi("AdminStaffMember");

function staffJson(member: StaffWithAdder, me: string) {
  return {
    id: encodeId("staff", member.id),
    name: member.name,
    email: member.email,
    role: member.role,
    is_you: member.id === me,
    added_at: member.createdAt.toISOString(),
    added_by: member.addedByName,
    last_seen_at: iso(member.lastSeenAt),
    passkeys: member.passkeys,
  };
}

/** The staff member named in the path's `{id}`, or a 404. */
export async function findStaff(c: Context<AppEnv>, data: StaffContext["data"]) {
  const id = decodeId("staff", c.req.param("id") ?? "");
  const member = id ? await data.staff.find(id) : null;
  if (!member) {
    throw new ApiError("not_found", {
      detail: "No staff member with that ID",
      hint: "List staff with GET /admin/v1/staff and use an `id` from there.",
    });
  }
  return member;
}

const lastOwner = () =>
  new ApiError("conflict", {
    detail: "This is the only owner",
    hint: "Make another staff member an owner first. The portal must always have one.",
  });

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/staff",
    summary: "List staff",
    tags: ["Admin"],
    responses: {
      200: ok(z.object({ data: z.array(StaffMember) }), "Current staff, oldest first"),
      ...errors,
    },
  }),
  async (c) => {
    const { data, staff } = await requireStaff(c, "staff:manage");
    const everyone = await data.staff.list();
    return c.json({ data: everyone.map((member) => staffJson(member, staff.id)) }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: "/admin/v1/staff",
    summary: "Add a staff member",
    description:
      "They need no Salon Staff account: passing Cloudflare Access with this email address is their sign-in. Add the same address to the Access list in Cloudflare, or they still can't get in. Must be confirmed with your passkey (action `staff.add`, target their email address).",
    tags: ["Admin"],
    request: {
      body: body(
        z.object({
          name: z.string().trim().min(1).max(100),
          email: z.string().trim().toLowerCase().email().max(254),
          role: z.enum(STAFF_ROLES),
          reason: Reason,
          confirmation: Confirmation,
        }),
      ),
    },
    responses: {
      201: ok(StaffMember, "The new staff member"),
      ...errors,
      409: problemResponse("Someone with that email address is already staff"),
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "staff:manage");
    const { data, staff } = ctx;
    const input = c.req.valid("json");
    const actor = await requireConfirmation(
      c,
      ctx,
      "staff.add",
      // The role is part of what's confirmed: "add X" can't be turned into "add X as an owner".
      `${input.email}:${input.role}`,
      input.confirmation,
    );
    const already = () =>
      new ApiError("conflict", {
        detail: `${input.email} is already staff`,
        hint: "Change their role from the Staff screen instead.",
      });
    if (await data.staff.findActive(input.email)) throw already();
    if (c.get("dryRun")) {
      const now = new Date().toISOString();
      return c.json(
        {
          id: encodeId("staff", "00000000-0000-0000-0000-000000000000"),
          name: input.name,
          email: input.email,
          role: input.role,
          is_you: false,
          added_at: now,
          added_by: staff.name,
          last_seen_at: null,
          passkeys: 0,
        },
        201,
      );
    }
    try {
      const member = await data.staff.add(input, actor);
      return c.json(staffJson({ ...member, addedByName: staff.name, passkeys: 0 }, staff.id), 201);
    } catch (error) {
      if (error instanceof StaffExistsError) throw already();
      throw error;
    }
  },
);

admin.openapi(
  createRoute({
    method: "patch",
    path: "/admin/v1/staff/{id}",
    summary: "Change a staff member's role",
    description:
      "You can't change your own role, and the last owner can't be made anything else. Must be confirmed with your passkey (action `staff.change_role`, target their ID).",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(
        z.object({ role: z.enum(STAFF_ROLES), reason: Reason, confirmation: Confirmation }),
      ),
    },
    responses: {
      200: ok(StaffMember, "The staff member with their new role"),
      ...errors,
      ...notFound,
      409: problemResponse("This is the only owner"),
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "staff:manage");
    const { data, staff } = ctx;
    const member = await findStaff(c, data);
    const { role, reason, confirmation } = c.req.valid("json");
    const actor = await requireConfirmation(
      c,
      ctx,
      "staff.change_role",
      `${encodeId("staff", member.id)}:${role}`,
      confirmation,
    );
    if (member.id === staff.id) {
      throw new ApiError("forbidden", {
        detail: "You can't change your own role",
        hint: "Ask another owner to change it.",
      });
    }
    const listed = (await data.staff.list()).find((row) => row.id === member.id);
    const rest = { addedByName: listed?.addedByName ?? null, passkeys: listed?.passkeys ?? 0 };
    if (c.get("dryRun")) return c.json(staffJson({ ...member, role, ...rest }, staff.id), 200);
    try {
      const changed = await data.staff.changeRole(member, role, reason, actor);
      return c.json(staffJson({ ...changed, ...rest }, staff.id), 200);
    } catch (error) {
      if (error instanceof LastOwnerError) throw lastOwner();
      throw error;
    }
  },
);

admin.openapi(
  createRoute({
    method: "delete",
    path: "/admin/v1/staff/{id}",
    summary: "Remove a staff member",
    description:
      "They are refused from their next request. What they did stays named in the audit log. You can't remove yourself or the last owner. Remove them from the Access list in Cloudflare as well. Must be confirmed with your passkey (action `staff.remove`, target their ID).",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(z.object({ reason: Reason, confirmation: Confirmation })),
    },
    responses: {
      200: ok(z.object({ removed: z.boolean() }), "They are no longer staff"),
      ...errors,
      ...notFound,
      409: problemResponse("This is the only owner"),
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "staff:manage");
    const { data, staff } = ctx;
    const member = await findStaff(c, data);
    const { reason, confirmation } = c.req.valid("json");
    const actor = await requireConfirmation(
      c,
      ctx,
      "staff.remove",
      encodeId("staff", member.id),
      confirmation,
    );
    if (member.id === staff.id) {
      throw new ApiError("forbidden", {
        detail: "You can't remove yourself",
        hint: "Ask another owner to remove you.",
      });
    }
    if (c.get("dryRun")) return c.json({ removed: true }, 200);
    try {
      await data.staff.remove(member, reason, actor);
    } catch (error) {
      if (error instanceof LastOwnerError) throw lastOwner();
      throw error;
    }
    return c.json({ removed: true }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/local-staff",
    summary: "Local development: the staff you can choose to be",
    description:
      "Exists only in local development, where there is no Cloudflare Access to say who you are. It is the one admin route with no staff check; everywhere else it answers 404.",
    tags: ["Admin"],
    responses: {
      200: ok(
        z.object({
          data: z.array(
            z.object({ name: z.string(), email: z.string(), role: z.enum(STAFF_ROLES) }),
          ),
        }),
        "Local staff",
      ),
      404: problemResponse("Not local development"),
    },
  }),
  async (c) => {
    const everyone = await localStaff(c);
    return c.json({ data: everyone.map(({ name, email, role }) => ({ name, email, role })) }, 200);
  },
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const ACTOR_TYPES = ["user", "staff", "system"] as const;

const AuditEvent = z
  .object({
    id: z.string(),
    occurred_at: z.string(),
    actor_type: z.enum(ACTOR_TYPES),
    actor_name: z.string().nullable(),
    action: z.string(),
    target_type: z.string().nullable(),
    target_id: z.string().nullable().openapi({
      description: "Prefixed (`usr_…`, `sln_…`) when the target is something with an API ID.",
    }),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    reason: z.string().nullable(),
    ip: z.string().nullable(),
    confirmed_with_passkey: z.boolean(),
  })
  .openapi("AdminAuditEvent");

export function auditJson(row: AuditRowWithNames) {
  return {
    id: encodeId("auditEvent", row.id),
    occurred_at: row.occurredAt.toISOString(),
    actor_type: row.actorType,
    actor_name: row.actorName,
    action: row.action,
    target_type: row.targetType,
    target_id: targetJson(row.targetType, row.targetId),
    before: row.before ?? null,
    after: row.after ?? null,
    reason: row.reason,
    ip: row.ip,
    confirmed_with_passkey: row.confirmedWith !== null,
  };
}

admin.openapi(
  createRoute({
    method: "get",
    path: "/admin/v1/audit-log",
    summary: "The audit log",
    description:
      "Newest first: what people, staff and the system did. `q` matches the action, the target's ID, or the name or email of who acted. `target` keeps it to one thing (a person, salon, job…), by its ID.",
    tags: ["Admin"],
    request: {
      query: PaginationQuery.extend({
        q: z.string().trim().max(200).optional(),
        target: z.string().trim().max(100).optional(),
        actor_type: z.enum(ACTOR_TYPES).optional(),
        days: z.coerce.number().int().min(1).max(365).optional(),
      }),
    },
    responses: { 200: ok(Page(AuditEvent), "A page of events"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "audit:read");
    const { limit, cursor, q, target, actor_type, days } = c.req.valid("query");
    const targetId = target ? anyId(target) : undefined;
    if (targetId === null) {
      throw new ApiError("validation_failed", {
        detail: "That isn't an ID",
        hint: "Send `target` as an ID from the API, such as `usr_…` or `sln_…`.",
        errors: [{ path: "target", message: "Not an ID" }],
      });
    }
    const rows = await data.audit.list({
      limit: limit + 1,
      before: decodeCursor(cursor),
      actorType: actor_type,
      since: days ? new Date(Date.now() - days * DAY_MS) : undefined,
      targetId,
      query: q,
    });
    return c.json(
      page(rows, limit, (row) => row.id, auditJson),
      200,
    );
  },
);
