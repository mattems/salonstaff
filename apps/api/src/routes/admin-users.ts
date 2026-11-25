/**
 * People in the admin portal: search, a person's page, flags, bans, signing out everywhere,
 * changing their role and deleting them. Each route starts with `requireStaff`.
 */
import { createRoute, z } from "@hono/zod-openapi";
import type { AdminFlag, AdminUser, BackOffice, FilesToDelete } from "@salonstaff/db";
import { ApiError, encodeId, jobPath, salonPath } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { decodeCursor, PaginationQuery } from "../lib/pagination";
import { Confirmation, requireConfirmation } from "../lib/staff-confirmation";
import { requireStaff } from "../lib/staff-context";
import { deleteUpload, mediaUrl } from "../lib/storage";
import {
  admin,
  body,
  errors,
  IdParams,
  iso,
  missing,
  notFound,
  ok,
  Page,
  page,
  pathId,
  QueryBoolean,
  Reason,
  realEmail,
} from "./admin";

const ROLES = ["seeker", "employer"] as const;
const LIST = "/admin/v1/users";

const User = z
  .object({
    id: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string().openapi({ description: "Their profile's name when they have one." }),
    email: z
      .string()
      .nullable()
      .openapi({ description: "Null for a mobile sign-up with no email yet." }),
    phone: z.string().nullable(),
    role: z.enum(ROLES),
    banned_at: z.string().nullable(),
    banned_reason: z.string().nullable(),
    open_flags: z.number().int(),
    id_verified: z.boolean(),
    created_at: z.string(),
  })
  .openapi("AdminUser");

const Flag = z
  .object({
    id: z.string(),
    reason: z.string(),
    created_at: z.string(),
    resolved_at: z.string().nullable(),
  })
  .openapi("AdminFlag");

const UserCheck = z
  .object({
    id: z.string(),
    kind: z.enum(["identity", "right_to_work", "qualification"]),
    status: z.string(),
    reference: z
      .string()
      .nullable()
      .openapi({ description: "The verification ID salons see, e.g. SSV-7K3M-9QXA." }),
    provider: z.string(),
    result: z.record(z.string(), z.unknown()).nullable().openapi({
      description: "The minimal result kept once decided. Null while the check is open.",
    }),
    review_note: z.string().nullable(),
    has_document: z.boolean(),
    decided_at: z.string().nullable(),
    created_at: z.string(),
  })
  .openapi("AdminUserCheck");

const UserDetail = z
  .object({
    user: User,
    profile: z
      .object({
        first_name: z.string(),
        last_name: z.string(),
        phone: z.string().nullable(),
        headline: z.string().nullable(),
        suburb: z.string(),
        state: z.string(),
        postcode: z.string(),
        roles: z.array(z.string()),
        years_experience: z.number().int(),
        right_to_work: z.string(),
        open_to_work: z.boolean(),
        instagram: z.string().nullable(),
        photo_url: z.string().nullable(),
      })
      .nullable(),
    checks: z.array(UserCheck),
    applications: z.array(
      z.object({
        id: z.string(),
        status: z.string(),
        created_at: z.string(),
        job: z.object({ id: z.string(), title: z.string(), path: z.string() }),
        salon: z.object({ id: z.string(), name: z.string() }),
      }),
    ),
    salons: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        suburb: z.string(),
        state: z.string(),
        status: z.string(),
        source: z.enum(["owner", "directory"]),
        path: z.string(),
        role: z.enum(["owner", "manager"]),
      }),
    ),
    flags: z.array(Flag),
    active_sessions: z.number().int(),
  })
  .openapi("AdminUserDetail");

type SearchRow = Awaited<ReturnType<BackOffice["users"]["search"]>>[number];

function userJson(row: {
  user: AdminUser;
  firstName: string | null;
  lastName: string | null;
  openFlags: number;
  idVerified: boolean;
}) {
  const { user } = row;
  const profileName = [row.firstName, row.lastName].filter(Boolean).join(" ");
  return {
    id: encodeId("user", user.id),
    name: profileName || user.name,
    email: realEmail(user.email),
    phone: user.phoneNumber,
    role: user.role,
    banned_at: iso(user.suspendedAt),
    banned_reason: user.suspendedReason,
    open_flags: Number(row.openFlags),
    id_verified: Boolean(row.idVerified),
    created_at: user.createdAt.toISOString(),
  };
}

const flagJson = (flag: AdminFlag) => ({
  id: encodeId("flag", flag.id),
  reason: flag.reason,
  created_at: flag.createdAt.toISOString(),
  resolved_at: iso(flag.resolvedAt),
});

async function findUser(c: Context<AppEnv>, data: BackOffice): Promise<AdminUser> {
  const user = await data.users.find(pathId(c, "user", LIST));
  return user ?? missing("person", LIST);
}

/** The person as the list shows them, after a change. */
async function userRow(data: BackOffice, user: AdminUser) {
  const detail = await data.users.detail(user.id);
  return userJson({
    user,
    firstName: detail?.profile?.firstName ?? null,
    lastName: detail?.profile?.lastName ?? null,
    openFlags: detail?.flags.filter((f) => !f.resolvedAt).length ?? 0,
    idVerified:
      detail?.checks.some((ch) => ch.kind === "identity" && ch.status === "verified") ?? false,
  });
}

/** Deletes files from R2 after the database change. A failure is logged, never fatal. */
export async function deleteFiles(c: Context<AppEnv>, files: FilesToDelete) {
  const results = await Promise.allSettled([
    ...files.media.map((key) => deleteUpload(c.env, "public", key)),
    ...files.private.map((key) => deleteUpload(c.env, "private", key)),
  ]);
  for (const result of results) {
    if (result.status === "rejected")
      console.error("Couldn't delete a file from R2", result.reason);
  }
}

admin.openapi(
  createRoute({
    method: "get",
    path: LIST,
    summary: "Search people",
    description:
      "Newest first. `q` matches an email address, name, phone number (`0412 345 678` works) or verification ID (`SSV-…`).",
    tags: ["Admin"],
    request: {
      query: PaginationQuery.extend({
        q: z.string().trim().max(200).optional(),
        role: z.enum(ROLES).optional(),
        banned: QueryBoolean.optional(),
        flagged: QueryBoolean.optional(),
      }),
    },
    responses: { 200: ok(Page(User), "A page of people"), ...errors },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "users:read");
    const { limit, cursor, q, role, banned, flagged } = c.req.valid("query");
    const rows = await data.users.search({
      limit: limit + 1,
      before: decodeCursor(cursor),
      q,
      role,
      banned,
      flagged,
    });
    return c.json(
      page(rows, limit, (row: SearchRow) => row.user.id, userJson),
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "get",
    path: `${LIST}/{id}`,
    summary: "A person's page",
    description:
      "Their account, profile, checks (verification IDs and minimal results only), applications, any salon they own, flags and how many sessions are open.",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: { 200: ok(UserDetail, "The person"), ...errors, ...notFound },
  }),
  async (c) => {
    const { data } = await requireStaff(c, "users:read");
    const d = await data.users.detail(pathId(c, "user", LIST));
    if (!d) missing("person", LIST);
    const decided = (status: string) => status === "verified" || status === "failed";
    return c.json(
      {
        user: userJson({
          user: d.user,
          firstName: d.profile?.firstName ?? null,
          lastName: d.profile?.lastName ?? null,
          openFlags: d.flags.filter((f) => !f.resolvedAt).length,
          idVerified: d.checks.some((ch) => ch.kind === "identity" && ch.status === "verified"),
        }),
        profile: d.profile
          ? {
              first_name: d.profile.firstName,
              last_name: d.profile.lastName,
              phone: d.profile.phone,
              headline: d.profile.headline,
              suburb: d.profile.suburb,
              state: d.profile.state,
              postcode: d.profile.postcode,
              roles: d.profile.roles,
              years_experience: d.profile.yearsExperience,
              right_to_work: d.profile.rightToWork,
              open_to_work: d.profile.openToWork,
              instagram: d.profile.instagram,
              photo_url: mediaUrl(c.env, d.profile.photoKey),
            }
          : null,
        checks: d.checks.map((ch) => ({
          id: encodeId("check", ch.id),
          kind: ch.kind,
          status: ch.status,
          reference: ch.reference,
          provider: ch.provider,
          result: decided(ch.status) ? ch.result : null,
          review_note: ch.reviewNote,
          has_document: Boolean(ch.documentKey),
          decided_at: iso(ch.decidedAt),
          created_at: ch.createdAt.toISOString(),
        })),
        applications: d.applications.map((a) => ({
          id: encodeId("application", a.id),
          status: a.status,
          created_at: a.createdAt.toISOString(),
          job: { id: encodeId("job", a.job.id), title: a.job.title, path: jobPath(a.job) },
          salon: { id: encodeId("salon", a.salon.id), name: a.salon.name },
        })),
        salons: d.salons.map(({ salon: s, role }) => ({
          id: encodeId("salon", s.id),
          name: s.name,
          suburb: s.suburb,
          state: s.state,
          status: s.status,
          source: s.source,
          path: salonPath(s),
          role,
        })),
        flags: d.flags.map(flagJson),
        active_sessions: d.activeSessions,
      },
      200,
    );
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/flags`,
    summary: "Flag a person",
    description:
      "A note for the team (reported by a salon, a suspicious profile…). A flag blocks nothing; a ban does.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ reason: Reason })) },
    responses: { 201: ok(Flag, "The flag"), ...errors, ...notFound },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "users:flag");
    const user = await findUser(c, data);
    const { reason } = c.req.valid("json");
    if (c.get("dryRun")) {
      const now = new Date();
      return c.json(
        flagJson({
          id: "00000000-0000-0000-0000-000000000000",
          userId: user.id,
          reason,
          createdBy: "",
          resolvedAt: null,
          createdAt: now,
        } as AdminFlag),
        201,
      );
    }
    return c.json(flagJson(await data.users.addFlag(user, reason, actor)), 201);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: "/admin/v1/flags/{id}/resolve",
    summary: "Resolve a flag",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: { 200: ok(Flag, "The flag, resolved"), ...errors, ...notFound },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "users:flag");
    const flag = await data.users.findFlag(pathId(c, "flag", `${LIST}/{id}`));
    if (!flag) missing("flag", `${LIST}/{id}`);
    if (c.get("dryRun"))
      return c.json(flagJson({ ...flag, resolvedAt: flag.resolvedAt ?? new Date() }), 200);
    return c.json(flagJson(await data.users.resolveFlag(flag, actor)), 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/ban`,
    summary: "Ban a person",
    description:
      "Signs them out everywhere at once and stops them signing in. Salons stop seeing their applications; a salon owner's jobs are hidden. Must be confirmed with your passkey (action `user.ban`, target their ID).",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(z.object({ reason: Reason, confirmation: Confirmation })),
    },
    responses: { 200: ok(User, "The person, banned"), ...errors, ...notFound },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "users:ban");
    const user = await findUser(c, ctx.data);
    const { reason, confirmation } = c.req.valid("json");
    const actor = await requireConfirmation(
      c,
      ctx,
      "user.ban",
      encodeId("user", user.id),
      confirmation,
    );
    if (user.suspendedAt) {
      throw new ApiError("conflict", {
        detail: "This person is already banned",
        hint: "Lift the ban first if you want to ban them again with another reason.",
      });
    }
    if (c.get("dryRun")) {
      return c.json(
        await userRow(ctx.data, { ...user, suspendedAt: new Date(), suspendedReason: reason }),
        200,
      );
    }
    return c.json(await userRow(ctx.data, await ctx.data.users.ban(user, reason, actor)), 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/unban`,
    summary: "Lift a ban",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: { 200: ok(User, "The person, no longer banned"), ...errors, ...notFound },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "users:ban");
    const user = await findUser(c, data);
    if (c.get("dryRun")) {
      return c.json(
        await userRow(data, { ...user, suspendedAt: null, suspendedReason: null }),
        200,
      );
    }
    return c.json(await userRow(data, await data.users.unban(user, actor)), 200);
  },
);

admin.openapi(
  createRoute({
    method: "post",
    path: `${LIST}/{id}/sign-out-everywhere`,
    summary: "Sign a person out everywhere",
    description: "Ends every session on every device. They can sign in again.",
    tags: ["Admin"],
    request: { params: IdParams },
    responses: {
      200: ok(z.object({ sessions_ended: z.number().int() }), "How many sessions were ended"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "users:ban");
    const user = await findUser(c, data);
    if (c.get("dryRun")) {
      return c.json(
        { sessions_ended: (await data.users.detail(user.id))?.activeSessions ?? 0 },
        200,
      );
    }
    return c.json({ sessions_ended: await data.users.signOutEverywhere(user, actor) }, 200);
  },
);

admin.openapi(
  createRoute({
    method: "patch",
    path: `${LIST}/{id}`,
    summary: "Change a person's role",
    description: "Job seeker or employer: what they see when they sign in.",
    tags: ["Admin"],
    request: { params: IdParams, body: body(z.object({ role: z.enum(ROLES) })) },
    responses: { 200: ok(User, "The person"), ...errors, ...notFound },
  }),
  async (c) => {
    const { data, actor } = await requireStaff(c, "users:ban");
    const user = await findUser(c, data);
    const { role } = c.req.valid("json");
    if (c.get("dryRun")) return c.json(await userRow(data, { ...user, role }), 200);
    return c.json(await userRow(data, await data.users.setRole(user, role, actor)), 200);
  },
);

admin.openapi(
  createRoute({
    method: "delete",
    path: `${LIST}/{id}`,
    summary: "Delete a person",
    description:
      "Permanently deletes their account, profile, pictures, applications and checks (with any evidence waiting for review). A salon they made is deleted with its jobs; a directory listing they claimed goes back to unclaimed. Must be confirmed with your passkey (action `user.delete`, target their ID).",
    tags: ["Admin"],
    request: {
      params: IdParams,
      body: body(z.object({ reason: Reason.optional(), confirmation: Confirmation })),
    },
    responses: {
      200: ok(z.object({ deleted: z.boolean() }), "They are gone"),
      ...errors,
      ...notFound,
    },
  }),
  async (c) => {
    const ctx = await requireStaff(c, "users:delete");
    const user = await findUser(c, ctx.data);
    const { reason, confirmation } = c.req.valid("json");
    const actor = await requireConfirmation(
      c,
      ctx,
      "user.delete",
      encodeId("user", user.id),
      confirmation,
    );
    if (c.get("dryRun")) return c.json({ deleted: true }, 200);
    await deleteFiles(c, await ctx.data.users.delete(user, reason, actor));
    return c.json({ deleted: true }, 200);
  },
);
