import { createRoute, z } from "@hono/zod-openapi";
import { salonConversations, salonScope, seekerConversations } from "@salonstaff/db";
import {
  APPLICANT_SORT_VALUES,
  APPLICATION_STATUS_VALUES,
  ApiError,
  applicationMessageSchema,
  encodeId,
} from "@salonstaff/shared";
import { userActor } from "../lib/actor";
import { broadcast, connectLive, requireWebSocket } from "../lib/live";
import { appUrl, notify } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  ApplicationMessageSchema,
  errors,
  json,
  jsonBody,
  MyApplicationThreadSchema,
  MyConversationSchema,
  pathParam,
  SalonApplicantsSchema,
  SalonConversationSchema,
  SalonParams,
} from "../lib/schemas";
import { idFrom, requireSalon, requireSeeker } from "../lib/session";
import { messageJson, myApplicationJson, salonApplicantJson, sendStateJson } from "../lib/views";

/** Conversations on applications (D-17), and the salon's list of everyone who applied. */
export const conversationRoutes = createRouter();

const SALON_TAGS = ["Applicants"];
const SEEKER_TAGS = ["Your applications"];
const MAX_APPLICANTS = 200;

const applicationHint =
  "Use an application `id` from GET /v1/employer/salons/{salonId}/applicants (salons) or GET /v1/me/applications (applicants).";

const ApplicationParams = SalonParams.extend({
  id: pathParam("id", "app_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});
const MyApplicationParams = z.object({
  id: pathParam("id", "app_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});

const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

const ApplicantsQuery = z.object({
  jobId: z.string().optional().openapi({ description: "Only this job's applicants." }),
  status: z.enum(APPLICATION_STATUS_VALUES).optional(),
  unread: flag.openapi({ description: "`true`: only those with replies your team hasn't read." }),
  verified: z.string().optional().openapi({
    description:
      "Checks that must have passed, comma-separated: `identity`, `right_to_work`, `qualification`.",
    example: "identity,right_to_work",
  }),
  openToWork: flag.openapi({ description: "`true`: only those open to work." }),
  minYears: z.coerce.number().int().min(0).max(60).optional(),
  q: z.string().trim().max(100).optional().openapi({ description: "Part of their name." }),
  sort: z.enum(APPLICANT_SORT_VALUES).default("newest"),
});

const CHECKS = ["identity", "right_to_work", "qualification"] as const;

const liveDescription = (who: string) =>
  `Opens a WebSocket for this conversation while it's on screen (D-18). Each new message arrives as \`{"type":"message","message":{...}}\` (the same message as in the conversation; ignore one you already have) and ${who} typing as \`{"type":"typing","from":"salon"|"seeker","name":"..."}\`. Send \`{"type":"typing"}\` every few seconds while your person types, and \`ping\` (answered \`pong\`) every 30 seconds or so. Close it when the conversation leaves the screen: while it's open, new messages aren't also sent to you by push or email. After a dropped connection, read the conversation again before reconnecting.`;

const liveResponses = {
  101: { description: "Switching to the WebSocket" },
  400: errors[400],
  401: errors[401],
  403: errors[403],
  404: errors[404],
};

// ---------- The salon's side ----------

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/applicants",
    summary: "Everyone who applied",
    description: `Applicants for all your salon's jobs (or one, with \`jobId\`), filtered and sorted, with how many of each status match the other filters (\`counts\`). Up to ${MAX_APPLICANTS}; narrow the filters for more. New applications shown become viewed.`,
    tags: SALON_TAGS,
    request: { params: SalonParams, query: ApplicantsQuery },
    responses: {
      200: json(SalonApplicantsSchema, "The applicants"),
      400: errors[400],
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salon, actor } = await requireSalon(c, c.req.valid("param").salonId);
    const query = c.req.valid("query");
    const verified = (query.verified ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const unknown = verified.filter((v) => !(CHECKS as readonly string[]).includes(v));
    if (unknown.length) {
      throw new ApiError("validation_failed", {
        detail: `Unknown check: ${unknown.join(", ")}`,
        hint: "Use `identity`, `right_to_work` or `qualification`, comma-separated.",
        errors: [{ path: "verified", message: "Not a check" }],
      });
    }
    const jobId = query.jobId
      ? idFrom("job", query.jobId, "job", "List your jobs on the salon's dashboard.")
      : undefined;
    const db = await c.get("db")();
    const result = await salonConversations(db, salon.id).search(
      {
        jobId,
        status: query.status,
        unread: query.unread,
        verified: verified as (typeof CHECKS)[number][],
        openToWork: query.openToWork,
        minYears: query.minYears,
        q: query.q,
        sort: query.sort,
        limit: MAX_APPLICANTS + 1,
      },
      actor,
    );
    return c.json(
      {
        items: result.items.slice(0, MAX_APPLICANTS).map((row) => salonApplicantJson(c.env, row)),
        counts: result.counts,
        total: result.total,
        truncated: result.items.length > MAX_APPLICANTS,
      },
      200,
    );
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/applications/{id}",
    summary: "One application, with its conversation",
    description:
      "The applicant, the job and every message, oldest first. Opening it marks their messages read (and a new application viewed).",
    tags: SALON_TAGS,
    request: { params: ApplicationParams },
    responses: {
      200: json(SalonConversationSchema, "The application"),
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salonId, id } = c.req.valid("param");
    const { salon, actor } = await requireSalon(c, salonId);
    const applicationId = idFrom("application", id, "application", applicationHint);
    const thread = await salonConversations(await c.get("db")(), salon.id).thread(
      applicationId,
      actor,
    );
    return c.json(
      {
        applicant: salonApplicantJson(c.env, thread.applicant),
        messages: thread.messages.map(messageJson),
        ...sendStateJson(thread.blocker),
      },
      200,
    );
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/applications/{id}/live",
    summary: "The conversation, live",
    description: liveDescription("the applicant"),
    tags: SALON_TAGS,
    request: { params: ApplicationParams },
    responses: liveResponses,
  }),
  async (c) => {
    requireWebSocket(c);
    const { salonId, id } = c.req.valid("param");
    const { salon, session } = await requireSalon(c, salonId);
    const applicationId = idFrom("application", id, "application", applicationHint);
    const { name } = await salonConversations(await c.get("db")(), salon.id).live(applicationId);
    return connectLive(c, applicationId, { side: "salon", userId: session.user.id, name });
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/applications/{id}/messages",
    summary: "Message an applicant",
    description: `Adds to the conversation on their application. They're told by push and email (as their notification settings allow) and reply in their inbox, on the website or in the app; neither of you sees the other's email.`,
    tags: SALON_TAGS,
    request: { params: ApplicationParams, ...jsonBody(applicationMessageSchema) },
    responses: {
      201: json(ApplicationMessageSchema, "Sent"),
      400: errors[400],
      401: errors[401],
      403: problemResponse("Your salon can't send messages now"),
      404: errors[404],
    },
  }),
  async (c) => {
    const { salonId, id } = c.req.valid("param");
    const { salon, session, actor } = await requireSalon(c, salonId);
    const applicationId = idFrom("application", id, "application", applicationHint);
    const { body } = c.req.valid("json");
    const conversations = salonConversations(await c.get("db")(), salon.id);
    // A dry run shows the message it would send, without opening the conversation (that marks it read).
    if (c.get("dryRun")) {
      return c.json(
        {
          id: encodeId("message", crypto.randomUUID()),
          from: "salon" as const,
          senderName: session.user.name.split(" ")[0] ?? null,
          body,
          createdAt: new Date().toISOString(),
        },
        201,
      );
    }
    const sent = await conversations.send(
      applicationId,
      { senderId: session.user.id, body },
      actor,
    );
    const message = messageJson(sent.message);
    const present = await broadcast(c, applicationId, { type: "message", message });
    const sender = sent.message.senderName ?? "Someone";
    // Someone with the conversation open has just seen it.
    if (!present.has(sent.contact.userId))
      notify(c, sent.contact, {
        topic: "messages",
        subject: `${salon.name} sent you a message about ${sent.job.title}`,
        title: `${sender} from ${salon.name}`,
        body: body,
        action: "Reply",
        url: appUrl(c, `/applications/${encodeId("application", applicationId)}`),
        footer:
          "Reply on Salon Staff, in your inbox. Replying to this email won't reach the salon.",
      });
    return c.json(message, 201);
  },
);

// ---------- The applicant's side ----------

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/conversations",
    summary: "Your conversations with salons",
    description:
      "Your applications a salon has written about, latest message first, with how many of theirs you haven't read.",
    tags: SEEKER_TAGS,
    responses: {
      200: json(
        z.object({ items: z.array(MyConversationSchema) }).openapi("MyConversations"),
        "Your conversations",
      ),
      401: errors[401],
      403: errors[403],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const rows = await seekerConversations(await c.get("db")(), session.user.id).list();
    return c.json(
      {
        items: rows.map((row) => ({
          ...myApplicationJson(c.env, row),
          lastMessage: row.lastMessage ? messageJson(row.lastMessage) : null,
        })),
      },
      200,
    );
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/applications/{id}",
    summary: "One of your applications, with its conversation",
    description:
      "Where it's up to, and every message with the salon, oldest first. Opening it marks the salon's messages read.",
    tags: SEEKER_TAGS,
    request: { params: MyApplicationParams },
    responses: {
      200: json(MyApplicationThreadSchema, "Your application"),
      401: errors[401],
      403: errors[403],
      404: errors[404],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const applicationId = idFrom(
      "application",
      c.req.valid("param").id,
      "application",
      applicationHint,
    );
    const thread = await seekerConversations(await c.get("db")(), session.user.id).thread(
      applicationId,
    );
    return c.json(
      {
        ...myApplicationJson(c.env, thread),
        messages: thread.messages.map(messageJson),
        ...sendStateJson(thread.blocker),
      },
      200,
    );
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/applications/{id}/live",
    summary: "Your conversation, live",
    description: liveDescription("the salon's team"),
    tags: SEEKER_TAGS,
    request: { params: MyApplicationParams },
    responses: liveResponses,
  }),
  async (c) => {
    requireWebSocket(c);
    const session = await requireSeeker(c);
    const applicationId = idFrom(
      "application",
      c.req.valid("param").id,
      "application",
      applicationHint,
    );
    const { name } = await seekerConversations(await c.get("db")(), session.user.id).live(
      applicationId,
    );
    return connectLive(c, applicationId, { side: "seeker", userId: session.user.id, name });
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/applications/{id}/messages",
    summary: "Reply to the salon",
    description: `Once the salon has written about your application. The people the job notifies are told by push and email.`,
    tags: SEEKER_TAGS,
    request: { params: MyApplicationParams, ...jsonBody(applicationMessageSchema) },
    responses: {
      201: json(ApplicationMessageSchema, "Sent"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      404: errors[404],
      409: problemResponse("The salon hasn't written yet"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const applicationId = idFrom(
      "application",
      c.req.valid("param").id,
      "application",
      applicationHint,
    );
    const { body } = c.req.valid("json");
    const db = await c.get("db")();
    const conversations = seekerConversations(db, session.user.id);
    if (c.get("dryRun")) {
      return c.json(
        {
          id: encodeId("message", crypto.randomUUID()),
          from: "seeker" as const,
          senderName: session.user.name.split(" ")[0] ?? null,
          body,
          createdAt: new Date().toISOString(),
        },
        201,
      );
    }
    const sent = await conversations.send(applicationId, body, userActor(c, session.user.id));
    const message = messageJson(sent.message);
    const present = await broadcast(c, applicationId, { type: "message", message });
    const team = await salonScope(db, sent.salon.id).applicationContacts(sent.job);
    // Someone on the team with the conversation open has just seen it.
    for (const contact of team.filter((t) => !present.has(t.userId))) {
      notify(c, contact, {
        topic: "messages",
        subject: `${sent.senderName} replied about ${sent.job.title}`,
        title: `${sent.senderName} replied`,
        body,
        action: "Read and reply",
        url: appUrl(
          c,
          `/employer/${encodeId("salon", sent.salon.id)}/applications/${encodeId("application", applicationId)}`,
        ),
        footer: `${sent.senderName} applied for ${sent.job.title} at ${sent.salon.name}. Reply on Salon Staff; replying to this email won't reach them.`,
      });
    }
    return c.json(message, 201);
  },
);
