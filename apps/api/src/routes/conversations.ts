import { createRoute, z } from "@hono/zod-openapi";
import { type ConversationMessage, salonConversations, seekerConversations } from "@salonstaff/db";
import {
  APPLICANT_SORT_VALUES,
  APPLICATION_STATUS_VALUES,
  ApiError,
  conversationMessageSchema,
  encodeId,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { userActor } from "../lib/actor";
import { broadcast, connectLive, requireWebSocket } from "../lib/live";
import { appUrl, notify } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  CandidateConversationSchema,
  errors,
  json,
  jsonBody,
  MessageSchema,
  MyApplicationDetailSchema,
  MyConversationSchema,
  MyConversationThreadSchema,
  pathParam,
  SalonApplicantSchema,
  SalonApplicantsSchema,
  SalonConversationSummarySchema,
  SalonParams,
} from "../lib/schemas";
import { idFrom, requireSalon, requireSeeker } from "../lib/session";
import {
  candidateConversationJson,
  conversationApplicationJson,
  messageJson,
  myApplicationJson,
  myConversationJson,
  salonApplicantJson,
  salonConversationSummaryJson,
  sendStateJson,
} from "../lib/views";

/**
 * Conversations (D-19): one between a salon's team and a job seeker, from an application or their
 * profile, live while open (D-18); and the salon's list of everyone who applied.
 */
export const conversationRoutes = createRouter();

const SALON_TAGS = ["Messages"];
const APPLICANT_TAGS = ["Applicants"];
const SEEKER_TAGS = ["Your messages"];
const MAX_APPLICANTS = 200;

const applicationHint =
  "Use an application `id` from GET /v1/employer/salons/{salonId}/applicants (salons) or GET /v1/me/applications (applicants).";

const ApplicationParams = SalonParams.extend({
  id: pathParam("id", "app_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});
const MyApplicationParams = z.object({
  id: pathParam("id", "app_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});
const CandidateParams = SalonParams.extend({
  userId: pathParam("userId", "usr_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});
const MyConversationParams = z.object({
  id: pathParam("id", "cnv_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});

const candidateHint =
  "Use a `candidateId` from your applicants, your conversations (GET /v1/employer/salons/{salonId}/conversations) or a shared profile.";
const conversationHint = "List your conversations with GET /v1/me/conversations and use an `id`.";

const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

export const ApplicantsQuery = z.object({
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

/** The search an applicants query asks for (its `jobId` is the caller's to check). */
export function applicantFilters(query: z.infer<typeof ApplicantsQuery>) {
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
    ? idFrom("job", query.jobId, "job", "List your jobs with GET /v1/employer/jobs.")
    : undefined;
  return {
    jobId,
    status: query.status,
    unread: query.unread,
    verified: verified as (typeof CHECKS)[number][],
    openToWork: query.openToWork,
    minYears: query.minYears,
    q: query.q,
    sort: query.sort,
    limit: MAX_APPLICANTS + 1,
  };
}

/** The response for a search's rows (one more than shown says there are more). */
export const applicantsJson = (
  env: AppEnv["Bindings"],
  result: Awaited<ReturnType<ReturnType<typeof salonConversations>["search"]>>,
) => ({
  items: result.items.slice(0, MAX_APPLICANTS).map((row) => salonApplicantJson(env, row)),
  counts: result.counts,
  total: result.total,
  truncated: result.items.length > MAX_APPLICANTS,
});

const liveDescription = (who: string) =>
  `Opens a WebSocket for this conversation while it's on screen (D-18); there's one per salon and job seeker (D-19), whatever it's about. Each new message arrives as \`{"type":"message","message":{...}}\` (the same message as in the conversation; ignore one you already have) and ${who} typing as \`{"type":"typing","from":"salon"|"seeker","name":"..."}\`. Send \`{"type":"typing"}\` every few seconds while your person types, and \`ping\` (answered \`pong\`) every 30 seconds or so. Close it when the conversation leaves the screen: while it's open, new messages aren't also sent to you by push or email. After a dropped connection, read the conversation again before reconnecting.`;

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
    tags: APPLICANT_TAGS,
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
    const filters = applicantFilters(c.req.valid("query"));
    const db = await c.get("db")();
    const result = await salonConversations(db, salon.id).search(filters, actor);
    return c.json(applicantsJson(c.env, result), 200);
  },
);

/** The application ID in a message, decoded; undefined when there's none. */
function aboutId(applicationId: string | undefined) {
  return applicationId
    ? idFrom(
        "application",
        applicationId,
        "applicationId",
        "Use an application listed in the conversation.",
      )
    : undefined;
}

/** A dry run's message: what would be sent, without opening or changing the conversation. */
const dryRunMessage = (from: "salon" | "seeker", senderName: string, body: string) => ({
  id: encodeId("message", crypto.randomUUID()),
  from,
  kind: "text" as const,
  senderName: senderName.split(" ")[0] ?? null,
  body,
  about: null,
  createdAt: new Date().toISOString(),
});

/** Tells the room, and returns the message's JSON with who has the conversation open. */
async function deliver(c: Context<AppEnv>, room: string, sent: ConversationMessage) {
  const message = messageJson(sent);
  const present = await broadcast(c, room, { type: "message", message });
  return { message, present };
}

// ---------- The salon's side ----------

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/conversations",
    summary: "Your salon's conversations",
    description:
      "Everyone your salon is talking to, from applications or their profiles, latest message first (the last 200), with how many of their messages your team hasn't read.",
    tags: SALON_TAGS,
    request: { params: SalonParams },
    responses: {
      200: json(
        z.object({ items: z.array(SalonConversationSummarySchema) }).openapi("SalonConversations"),
        "The conversations",
      ),
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salon } = await requireSalon(c, c.req.valid("param").salonId);
    const rows = await salonConversations(await c.get("db")(), salon.id).list();
    return c.json({ items: rows.map(salonConversationSummaryJson) }, 200);
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/candidates/{userId}/conversation",
    summary: "Your conversation with someone",
    description:
      "Every message between your salon and this person, oldest first, and their applications to you. It may have no messages yet. Opening it marks their messages read.",
    tags: SALON_TAGS,
    request: { params: CandidateParams },
    responses: {
      200: json(CandidateConversationSchema, "The conversation"),
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salonId, userId } = c.req.valid("param");
    const { salon } = await requireSalon(c, salonId);
    const seekerId = idFrom("user", userId, "candidate", candidateHint);
    const thread = await salonConversations(await c.get("db")(), salon.id).thread(seekerId);
    return c.json(candidateConversationJson(thread), 200);
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/candidates/{userId}/live",
    summary: "Your conversation with someone, live",
    description: liveDescription("the job seeker"),
    tags: SALON_TAGS,
    request: { params: CandidateParams },
    responses: liveResponses,
  }),
  async (c) => {
    requireWebSocket(c);
    const { salonId, userId } = c.req.valid("param");
    const { salon, session } = await requireSalon(c, salonId);
    const seekerId = idFrom("user", userId, "candidate", candidateHint);
    const { room, name } = await salonConversations(await c.get("db")(), salon.id).live(seekerId);
    return connectLive(c, room, { side: "salon", userId: session.user.id, name });
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/employer/salons/{salonId}/candidates/{userId}/messages",
    summary: "Message someone",
    description: `Writes in your conversation with them, starting it if there isn't one: someone who applied to your salon, or whose profile you can see and who takes messages (their \`contact.message\`). Say which application it's about with \`applicationId\`. They're told by push and email (as their notification settings allow) and reply on Salon Staff; neither of you sees the other's email. Until they've applied or replied, your salon can start conversations with 25 new people a day, and write to each once a day.`,
    tags: SALON_TAGS,
    request: { params: CandidateParams, ...jsonBody(conversationMessageSchema) },
    responses: {
      201: json(MessageSchema, "Sent"),
      400: errors[400],
      401: errors[401],
      403: problemResponse("Your salon can't send messages now"),
      404: errors[404],
      409: problemResponse("They don't take messages"),
      429: problemResponse("Today's limit for people who haven't applied or replied"),
    },
  }),
  async (c) => {
    const { salonId, userId } = c.req.valid("param");
    const { salon, session, actor } = await requireSalon(c, salonId);
    const seekerId = idFrom("user", userId, "candidate", candidateHint);
    const input = c.req.valid("json");
    const applicationId = aboutId(input.applicationId);
    if (c.get("dryRun")) return c.json(dryRunMessage("salon", session.user.name, input.body), 201);
    const sent = await salonConversations(await c.get("db")(), salon.id).send(
      seekerId,
      { senderId: session.user.id, body: input.body, applicationId },
      actor,
    );
    const { message, present } = await deliver(c, sent.room, sent.message);
    const sender = sent.message.senderName ?? "Someone";
    // Someone with the conversation open has just seen it.
    if (!present.has(sent.contact.userId)) {
      notify(c, sent.contact, {
        topic: "messages",
        subject: sent.message.aboutJob
          ? `${salon.name} sent you a message about ${sent.message.aboutJob}`
          : `${salon.name} sent you a message`,
        title: `${sender} from ${salon.name}`,
        body: input.body,
        action: "Reply",
        url: appUrl(c, `/inbox?c=${encodeId("conversation", sent.conversationId)}`),
        footer: `Reply on Salon Staff, in your inbox. Replying to this email won't reach the salon. To stop ${salon.name} contacting you, hide your profile from them in your inbox.`,
      });
    }
    return c.json(message, 201);
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/employer/salons/{salonId}/applications/{id}",
    summary: "One application",
    description:
      "The applicant, the job, where it's up to and how many of their messages your team hasn't read (`unreadMessages`). Opening it makes a new application viewed. The conversation with them is GET …/candidates/{candidateId}/conversation (D-19).",
    tags: APPLICANT_TAGS,
    request: { params: ApplicationParams },
    responses: {
      200: json(SalonApplicantSchema, "The application"),
      401: errors[401],
      404: errors[404],
    },
  }),
  async (c) => {
    const { salonId, id } = c.req.valid("param");
    const { salon, actor } = await requireSalon(c, salonId);
    const applicationId = idFrom("application", id, "application", applicationHint);
    const applicant = await salonConversations(await c.get("db")(), salon.id).application(
      applicationId,
      actor,
    );
    return c.json(salonApplicantJson(c.env, applicant), 200);
  },
);

// ---------- The job seeker's side ----------

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/conversations",
    summary: "Your conversations with salons",
    description:
      "Every salon that has written to you or looked at your number, latest first (the last 200), with how many of their messages you haven't read.",
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
    return c.json({ items: rows.map((row) => myConversationJson(c.env, row)) }, 200);
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/conversations/{id}",
    summary: "One of your conversations",
    description:
      "Every message with the salon, oldest first, and your applications to it. Opening it marks the salon's messages read.",
    tags: SEEKER_TAGS,
    request: { params: MyConversationParams },
    responses: {
      200: json(MyConversationThreadSchema, "The conversation"),
      401: errors[401],
      403: errors[403],
      404: errors[404],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const id = idFrom("conversation", c.req.valid("param").id, "conversation", conversationHint);
    const thread = await seekerConversations(await c.get("db")(), session.user.id).thread(id);
    return c.json(
      {
        ...myConversationJson(c.env, thread),
        applications: thread.applications.map(conversationApplicationJson),
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
    path: "/v1/me/conversations/{id}/live",
    summary: "One of your conversations, live",
    description: liveDescription("the salon's team"),
    tags: SEEKER_TAGS,
    request: { params: MyConversationParams },
    responses: liveResponses,
  }),
  async (c) => {
    requireWebSocket(c);
    const session = await requireSeeker(c);
    const id = idFrom("conversation", c.req.valid("param").id, "conversation", conversationHint);
    const { room, name } = await seekerConversations(await c.get("db")(), session.user.id).live(id);
    return connectLive(c, room, { side: "seeker", userId: session.user.id, name });
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/conversations/{id}/messages",
    summary: "Reply to a salon",
    description:
      "Once the salon has written. Say which of your applications it's about with `applicationId`; without one it follows the salon's last message. The salon's team is told by push and email.",
    tags: SEEKER_TAGS,
    request: { params: MyConversationParams, ...jsonBody(conversationMessageSchema) },
    responses: {
      201: json(MessageSchema, "Sent"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      404: errors[404],
      409: problemResponse("The salon hasn't written yet"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const id = idFrom("conversation", c.req.valid("param").id, "conversation", conversationHint);
    const input = c.req.valid("json");
    const applicationId = aboutId(input.applicationId);
    if (c.get("dryRun")) return c.json(dryRunMessage("seeker", session.user.name, input.body), 201);
    const sent = await seekerConversations(await c.get("db")(), session.user.id).send(
      id,
      { body: input.body, applicationId },
      userActor(c, session.user.id),
    );
    const { message, present } = await deliver(c, sent.room, sent.message);
    const about = sent.message.aboutJob;
    // Someone on the team with the conversation open has just seen it.
    for (const contact of sent.team.filter((t) => !present.has(t.userId))) {
      notify(c, contact, {
        topic: "replies",
        subject: about ? `${sent.senderName} replied about ${about}` : `${sent.senderName} replied`,
        title: `${sent.senderName} replied`,
        body: input.body,
        action: "Read and reply",
        url: appUrl(
          c,
          `/employer/messages?salon=${encodeId("salon", sent.salon.id)}&with=${encodeId("user", session.user.id)}`,
        ),
        footer: `${sent.senderName} is talking to ${sent.salon.name} on Salon Staff. Reply there; replying to this email won't reach them.`,
      });
    }
    return c.json(message, 201);
  },
);

conversationRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/applications/{id}",
    summary: "One of your applications",
    description:
      "Where it's up to, and your conversation with the salon (`conversationId`, once they've written) with how many of its messages you haven't read. Read and reply with GET and POST /v1/me/conversations/{conversationId}.",
    tags: ["Your applications"],
    request: { params: MyApplicationParams },
    responses: {
      200: json(MyApplicationDetailSchema, "Your application"),
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
    const found = await seekerConversations(await c.get("db")(), session.user.id).application(
      applicationId,
    );
    return c.json(
      {
        ...myApplicationJson(c.env, found),
        conversationId: found.conversationId
          ? encodeId("conversation", found.conversationId)
          : null,
      },
      200,
    );
  },
);
