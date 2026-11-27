/**
 * The rows behind conversations (D-19): one per salon and job seeker. Shared by the salon's and the
 * job seeker's scopes (`conversations.ts`) and the salon's number looks (`salon.ts`).
 */
import { ApiError, CONTACT_LIMITS } from "@salonstaff/shared";
import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { Executor } from "./audit";
import {
  applications,
  conversationMessages,
  conversations,
  jobs,
  salonMembers,
  users,
} from "./schema";

export type Side = "salon" | "seeker";

export type ConversationMessage = typeof conversationMessages.$inferSelect & {
  /** Who wrote it, as the other side sees them: a first name. Null once their account is gone. */
  senderName: string | null;
  /** The job of the application it's about, if any. */
  aboutJob: string | null;
};

export const EPOCH = sql`'epoch'::timestamptz`;

export const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || null;

/** Messages from `from` in a conversation (`conversations` in the query) the other side hasn't read. */
export const unreadIn = (from: Side) => {
  const readAt = from === "seeker" ? conversations.salonReadAt : conversations.seekerReadAt;
  return sql<number>`(select count(*)::int from ${conversationMessages} m
    where m.conversation_id = ${conversations.id} and m."from" = ${from}
    and m.created_at > coalesce(${readAt}, ${EPOCH}))`;
};

/**
 * For a query over applications joined to their jobs: the unread messages from `from` in the
 * conversation between the job's salon and the applicant.
 */
export const unreadForApplication = (from: Side) => {
  const readAt = from === "seeker" ? sql`c.salon_read_at` : sql`c.seeker_read_at`;
  return sql<number>`(select count(*)::int from ${conversationMessages} m
    join ${conversations} c on c.id = m.conversation_id
    where c.salon_id = ${jobs.salonId} and c.seeker_id = ${applications.seekerId}
    and m."from" = ${from} and m.created_at > coalesce(${readAt}, ${EPOCH}))`;
};

/** For a query over applications joined to their jobs: when the salon and applicant last wrote. */
export const lastMessageForApplication = sql<Date | null>`(select c.last_message_at
  from ${conversations} c
  where c.salon_id = ${jobs.salonId} and c.seeker_id = ${applications.seekerId})`;

/** The conversation between a salon and a job seeker, if there is one. */
export async function findConversation(tx: Executor, salonId: string, seekerId: string) {
  const [row] = await tx
    .select()
    .from(conversations)
    .where(and(eq(conversations.salonId, salonId), eq(conversations.seekerId, seekerId)));
  return row ?? null;
}

/** The conversation between a salon and a job seeker, made if there isn't one yet. */
export async function conversationFor(
  tx: Executor,
  salonId: string,
  seekerId: string,
): Promise<string> {
  const [row] = await tx
    .insert(conversations)
    .values({ salonId, seekerId })
    .onConflictDoUpdate({
      target: [conversations.salonId, conversations.seekerId],
      set: { salonId: sql`excluded.salon_id` },
    })
    .returning({ id: conversations.id });
  if (!row) throw new Error("No conversation returned");
  return row.id;
}

const messageQuery = (tx: Executor) =>
  tx
    .select({ message: conversationMessages, name: users.name, job: jobs.title })
    .from(conversationMessages)
    .leftJoin(users, eq(users.id, conversationMessages.senderId))
    .leftJoin(applications, eq(applications.id, conversationMessages.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId));

type MessageRow = Awaited<ReturnType<ReturnType<typeof messageQuery>["where"]>>[number];

export const toMessage = (r: MessageRow): ConversationMessage => ({
  ...r.message,
  senderName: firstName(r.name),
  aboutJob: r.job,
});

/** Every message in a conversation, oldest first. */
export async function messagesOf(
  tx: Executor,
  conversationId: string,
): Promise<ConversationMessage[]> {
  const rows = await messageQuery(tx)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt));
  return rows.map(toMessage);
}

/** Whether the salon has written (not just looked at their number). */
export async function salonHasWritten(tx: Executor, conversationId: string) {
  const [row] = await tx
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.from, "salon"),
        eq(conversationMessages.kind, "text"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Adds a message (or a number look) to a conversation. The sender's side has read everything up to
 * it.
 */
export async function addMessage(
  tx: Executor,
  input: {
    conversationId: string;
    from: Side;
    kind?: "text" | "number_viewed";
    senderId: string;
    body?: string;
    applicationId?: string | null;
  },
): Promise<ConversationMessage> {
  const now = new Date();
  if ((input.kind ?? "text") === "text") {
    // Each message notifies someone (an email, a push, sometimes a text): only so many an hour.
    const [recent] = await tx
      .select({ n: count() })
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.senderId, input.senderId),
          eq(conversationMessages.kind, "text"),
          gt(conversationMessages.createdAt, new Date(now.getTime() - 60 * 60_000)),
        ),
      );
    if ((recent?.n ?? 0) >= CONTACT_LIMITS.messagesPerHour) {
      throw new ApiError("rate_limited", {
        detail: `You can send up to ${CONTACT_LIMITS.messagesPerHour} messages an hour`,
        hint: "Wait a while and try again.",
      });
    }
  }
  const [inserted] = await tx
    .insert(conversationMessages)
    .values({
      conversationId: input.conversationId,
      from: input.from,
      kind: input.kind ?? "text",
      senderId: input.senderId,
      body: input.body ?? "",
      applicationId: input.applicationId ?? null,
      createdAt: now,
    })
    .returning({ id: conversationMessages.id });
  await tx
    .update(conversations)
    .set({
      lastMessageAt: now,
      ...(input.from === "salon" ? { salonReadAt: now } : { seekerReadAt: now }),
    })
    .where(eq(conversations.id, input.conversationId));
  const [row] = await messageQuery(tx).where(eq(conversationMessages.id, inserted?.id ?? ""));
  if (!row) throw new Error("Message not saved");
  return toMessage(row);
}

/** The live room for a salon and job seeker (D-18): one per pair, made or not. */
export const roomOf = (salonId: string, seekerId: string) => `${salonId}:${seekerId}`;

/**
 * Who may have a room open right now: the salon's team and the job seeker, none of them banned.
 * Checked each time something is sent to the room, so someone taken off the team (or banned)
 * since they opened the conversation stops hearing it.
 */
export async function roomAudience(db: Executor, room: string): Promise<string[]> {
  const [salonId = "", seekerId = ""] = room.split(":");
  const [team, seeker] = await Promise.all([
    db
      .select({ id: salonMembers.userId })
      .from(salonMembers)
      .innerJoin(users, eq(users.id, salonMembers.userId))
      .where(and(eq(salonMembers.salonId, salonId), isNull(users.suspendedAt))),
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, seekerId), isNull(users.suspendedAt))),
  ]);
  return [...team, ...seeker].map((row) => row.id);
}
