import { createRoute, z } from "@hono/zod-openapi";
import { INVITE_DAYS, invites } from "@salonstaff/db";
import { ApiError, BRAND } from "@salonstaff/shared";
import { userActor } from "../lib/actor";
import { appUrl, sendEmail } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  errors,
  json,
  jsonBody,
  MySalonSchema,
  pathParam,
  SalonParams,
  SalonRoleSchema,
  TeamInviteSchema,
  TeamSchema,
} from "../lib/schemas";
import { idFrom, requireSalon, requireUser } from "../lib/session";
import { mySalonJson, teamInviteJson, teamMemberJson } from "../lib/views";

/**
 * A salon's team (D-11): owners and managers, and owners' emailed invites. Everyone on the team can
 * see it; owners change it. Anyone can leave, except a salon's last owner.
 */
export const teamRoutes = createRouter();

const TAGS = ["Salon"];
const TEAM = "/v1/employer/salons/{salonId}/team";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const MemberParams = SalonParams.extend({
  userId: pathParam("userId", "usr_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});
const InviteParams = SalonParams.extend({
  inviteId: pathParam("inviteId", "inv_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});
const TokenParams = z.object({ token: pathParam("token", "q2f…") });

const TEAM_HINT = `List the team with GET ${TEAM}.`;
const memberIdFrom = (value: string) => idFrom("user", value, "team member", TEAM_HINT);

const roleLabel = (role: "owner" | "manager") => (role === "owner" ? "an owner" : "a manager");

teamRoutes.openapi(
  createRoute({
    method: "get",
    path: TEAM,
    summary: "A salon's team",
    description:
      "Its owners and managers, and invites not yet accepted. Owners change the salon's details, billing and team; managers handle jobs and applicants.",
    tags: TAGS,
    request: { params: SalonParams },
    responses: { 200: json(TeamSchema, "The team"), 401: errors[401], 404: errors[404] },
  }),
  async (c) => {
    const { team, session } = await requireSalon(c, c.req.valid("param").salonId);
    const [members, pending] = await Promise.all([team.members(), team.invites()]);
    return c.json(
      {
        members: members.map((m) => teamMemberJson(m, session.user.id)),
        invites: pending.map(teamInviteJson),
      },
      200,
    );
  },
);

teamRoutes.openapi(
  createRoute({
    method: "post",
    path: `${TEAM}/invites`,
    summary: "Invite someone to the team",
    description: `Owners only. Emails them a link that lasts ${INVITE_DAYS} days; they sign in or sign up however they like and accept it. Inviting the same address again replaces the earlier invite.`,
    tags: TAGS,
    request: {
      params: SalonParams,
      ...jsonBody(
        z
          .object({
            email: z.string().trim().toLowerCase().email().max(254),
            role: SalonRoleSchema,
          })
          .openapi("NewInvite"),
      ),
    },
    responses: {
      201: json(TeamInviteSchema, "The invite"),
      400: errors[400],
      401: errors[401],
      403: problemResponse("Only owners invite people"),
      404: errors[404],
      409: problemResponse("They're already on the team"),
    },
  }),
  async (c) => {
    const { team, salon, session, actor } = await requireSalon(
      c,
      c.req.valid("param").salonId,
      "owner",
    );
    const input = c.req.valid("json");
    if (c.get("dryRun")) {
      const now = new Date();
      return c.json(
        teamInviteJson({
          id: NIL_UUID,
          salonId: salon.id,
          email: input.email,
          role: input.role,
          tokenHash: "",
          expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
          invitedBy: session.user.id,
          createdAt: now,
        }),
        201,
      );
    }
    const { invite, token } = await team.invite(
      { email: input.email, role: input.role, invitedBy: session.user.id },
      actor,
    );
    const url = new URL(appUrl(c, "/invite"));
    url.searchParams.set("token", token);
    const from = session.user.name || "The owner";
    sendEmail(c, invite.email, {
      subject: `Join ${salon.name} on ${BRAND.name}`,
      title: `${from} invited you to ${salon.name}`,
      body: `You're invited to help run ${salon.name} on ${BRAND.name} as ${roleLabel(invite.role)}: posting jobs and looking after applicants${invite.role === "owner" ? ", the salon's details, billing and team" : ""}. The link lasts ${INVITE_DAYS} days.`,
      action: "Accept the invite",
      url: url.toString(),
      footer: "If you didn't expect this, ignore this email: nothing changes.",
    });
    return c.json(teamInviteJson(invite), 201);
  },
);

teamRoutes.openapi(
  createRoute({
    method: "delete",
    path: `${TEAM}/invites/{inviteId}`,
    summary: "Cancel an invite",
    description: "Owners only. The emailed link stops working.",
    tags: TAGS,
    request: { params: InviteParams },
    responses: {
      200: json(z.object({ cancelled: z.literal(true) }).openapi("InviteCancelled"), "Gone"),
      401: errors[401],
      403: problemResponse("Only owners cancel invites"),
      404: errors[404],
    },
  }),
  async (c) => {
    const params = c.req.valid("param");
    const { team, actor } = await requireSalon(c, params.salonId, "owner");
    const id = idFrom("invite", params.inviteId, "invite", TEAM_HINT);
    if (!c.get("dryRun")) await team.cancelInvite(id, actor);
    return c.json({ cancelled: true as const }, 200);
  },
);

teamRoutes.openapi(
  createRoute({
    method: "patch",
    path: `${TEAM}/{userId}`,
    summary: "Change someone's role",
    description: "Owners only. A salon keeps at least one owner.",
    tags: TAGS,
    request: {
      params: MemberParams,
      ...jsonBody(z.object({ role: SalonRoleSchema }).openapi("RoleChange")),
    },
    responses: {
      200: json(TeamSchema, "The team"),
      400: errors[400],
      401: errors[401],
      403: problemResponse("Only owners change roles"),
      404: errors[404],
      409: problemResponse("That would leave the salon without an owner"),
    },
  }),
  async (c) => {
    const params = c.req.valid("param");
    const { team, session, actor } = await requireSalon(c, params.salonId, "owner");
    const userId = memberIdFrom(params.userId);
    if (!c.get("dryRun")) await team.setRole(userId, c.req.valid("json").role, actor);
    const [members, pending] = await Promise.all([team.members(), team.invites()]);
    return c.json(
      {
        members: members.map((m) => teamMemberJson(m, session.user.id)),
        invites: pending.map(teamInviteJson),
      },
      200,
    );
  },
);

teamRoutes.openapi(
  createRoute({
    method: "delete",
    path: `${TEAM}/{userId}`,
    summary: "Take someone off the team, or leave",
    description:
      "Owners can take anyone off; anyone can take themselves off (leave). A salon's last owner can't go: make someone else an owner first.",
    tags: TAGS,
    request: { params: MemberParams },
    responses: {
      200: json(z.object({ removed: z.literal(true) }).openapi("MemberRemoved"), "Gone"),
      401: errors[401],
      403: problemResponse("Only owners take other people off"),
      404: errors[404],
      409: problemResponse("That would leave the salon without an owner"),
    },
  }),
  async (c) => {
    const params = c.req.valid("param");
    const { team, session, role, actor } = await requireSalon(c, params.salonId);
    const userId = memberIdFrom(params.userId);
    if (userId !== session.user.id && role !== "owner") {
      throw new ApiError("forbidden", {
        detail: "Only the salon's owners can take other people off the team",
        hint: "You can leave yourself: use your own `userId`.",
      });
    }
    if (!c.get("dryRun")) await team.remove(userId, actor);
    return c.json({ removed: true as const }, 200);
  },
);

// ---------------------------------------------------------------------------
// Opening an invite link
// ---------------------------------------------------------------------------

teamRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/invites/{token}",
    summary: "What an invite is for",
    description: "The salon and role an emailed invite link offers, to show before accepting.",
    tags: TAGS,
    request: { params: TokenParams },
    responses: {
      200: json(
        z
          .object({
            salon: z.object({ name: z.string(), suburb: z.string(), state: z.string() }),
            role: SalonRoleSchema,
            invitedBy: z.string().nullable(),
            email: z.string(),
            expiresAt: z.string(),
          })
          .openapi("InvitePreview"),
        "The invite",
      ),
      400: problemResponse("The link is invalid or has expired"),
    },
  }),
  async (c) => {
    const row = await invites(await c.get("db")()).preview(c.req.valid("param").token);
    return c.json(
      {
        salon: { name: row.salon.name, suburb: row.salon.suburb, state: row.salon.state },
        role: row.invite.role,
        invitedBy: row.invitedBy || null,
        email: row.invite.email,
        expiresAt: row.invite.expiresAt.toISOString(),
      },
      200,
    );
  },
);

teamRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/invites/{token}/accept",
    summary: "Accept an invite",
    description:
      "Sign in first, with any account. You join the salon's team (a manager invited as an owner becomes one) and your account becomes an employer account. The link is then used up.",
    tags: TAGS,
    request: { params: TokenParams },
    responses: {
      200: json(MySalonSchema, "The salon you joined"),
      400: problemResponse("The link is invalid or has expired"),
      401: errors[401],
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    if (c.get("dryRun")) {
      throw new ApiError("validation_failed", {
        detail: "An invite link can't be tried out",
        hint: "Send the request without dry_run to accept the invite.",
      });
    }
    const db = await c.get("db")();
    const { salon, role } = await invites(db).accept(
      c.req.valid("param").token,
      session.user.id,
      userActor(c, session.user.id),
    );
    return c.json(mySalonJson(c.env, salon, role), 200);
  },
);
