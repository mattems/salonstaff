/**
 * Conversations (D-19): one between a salon's team and a job seeker, however it started (an
 * application, or their profile), and the salon's view of everyone who applied, filtered.
 * `salonConversations` is scoped to one salon; `seekerConversations` to one job seeker.
 */
import {
  APPLICATION_STATUS_VALUES,
  ApiError,
  type ApplicantSort,
  type ApplicationStatus,
  contactLimitReached,
  type MessageBlocker,
  messageBlockerOf,
} from "@salonstaff/shared";
import { and, asc, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import { type CheckSummary, summariesFor } from "./checks";
import {
  addMessage,
  type ConversationMessage,
  conversationFor,
  findConversation,
  lastMessageForApplication,
  messagesOf,
  roomOf,
  salonHasWritten,
  toMessage,
  unreadForApplication,
  unreadIn,
} from "./conversation-rows";
import type { Db } from "./index";
import { contains } from "./like";
import {
  type Applicant,
  CONTACT_LIMIT_DETAIL,
  type Contact,
  jobsWithCounts,
  notFoundCandidate,
  type SalonJob,
  salonAccessOf,
  salonsFor,
} from "./salon";
import {
  applications,
  conversationMessages,
  conversations,
  jobs,
  salonMembers,
  salons,
  seekerChecks,
  seekerHiddenSalons,
  seekerProfiles,
  users,
} from "./schema";
import type { Application, SeekerProfile } from "./seeker";
import type { Job, Salon } from "./visibility";

export type { ConversationMessage } from "./conversation-rows";
export { roomAudience, roomOf } from "./conversation-rows";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One of the job seeker's applications to the salon, shown at the top of their conversation. */
export interface ConversationApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  status: ApplicationStatus;
  createdAt: Date;
}

async function applicationsBetween(
  tx: Executor,
  salonId: string,
  seekerId: string,
): Promise<ConversationApplication[]> {
  return tx
    .select({
      id: applications.id,
      jobId: jobs.id,
      jobTitle: jobs.title,
      status: applications.status,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.seekerId, seekerId), eq(jobs.salonId, salonId)))
    .orderBy(desc(applications.createdAt));
}

/** Checks an application belongs to this salon and job seeker; null for none. */
async function aboutApplication(
  tx: Executor,
  salonId: string,
  seekerId: string,
  applicationId: string | null | undefined,
): Promise<string | null> {
  if (!applicationId) return null;
  const mine = await applicationsBetween(tx, salonId, seekerId);
  if (!mine.some((a) => a.id === applicationId)) {
    throw new ApiError("validation_failed", {
      detail: "That application isn't between you",
      hint: "Leave out `applicationId`, or use one listed in the conversation's `applications`.",
      errors: [{ path: "applicationId", message: "Not an application between you" }],
    });
  }
  return applicationId;
}

/** The latest message from `from`, newest first per conversation. */
async function lastMessages(
  tx: Executor,
  ids: string[],
): Promise<Map<string, ConversationMessage>> {
  if (!ids.length) return new Map();
  const rows = await tx
    .selectDistinctOn([conversationMessages.conversationId], {
      message: conversationMessages,
      name: users.name,
      job: jobs.title,
    })
    .from(conversationMessages)
    .leftJoin(users, eq(users.id, conversationMessages.senderId))
    .leftJoin(applications, eq(applications.id, conversationMessages.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .where(inArray(conversationMessages.conversationId, ids))
    .orderBy(conversationMessages.conversationId, desc(conversationMessages.createdAt));
  return new Map(rows.map((r) => [r.message.conversationId, toMessage(r)]));
}

const BLOCKED: Record<MessageBlocker, () => ApiError> = {
  salon_suspended: () =>
    new ApiError("forbidden", {
      detail: "This salon can't send or receive messages right now",
      hint: "Contact support@salonstaff.com.au if you think that's wrong.",
    }),
  wait_for_salon: () =>
    new ApiError("conflict", {
      detail: "The salon hasn't written to you yet",
      hint: "You can reply once the salon messages you. If you applied, your cover note is with them already.",
    }),
  not_taking_messages: () =>
    new ApiError("conflict", {
      detail: "This person doesn't take messages",
      hint: "Call them instead, if their profile shows a number.",
    }),
};

// ---------- The salon's side ----------

export interface ApplicantFilters {
  /** Only this salon's applicants (one the person is on the team of, for `employerDesk`). */
  salonId?: string | undefined;
  jobId?: string | undefined;
  status?: ApplicationStatus | undefined;
  /** Only applicants with messages the team hasn't read. */
  unread?: boolean | undefined;
  /** Checks that must all have passed. */
  verified?: ("identity" | "right_to_work" | "qualification")[] | undefined;
  openToWork?: boolean | undefined;
  minYears?: number | undefined;
  /** Part of their name. */
  q?: string | undefined;
  sort: ApplicantSort;
  limit: number;
}

export interface SalonApplicant extends Applicant {
  job: Pick<Job, "id" | "salonId" | "title" | "slug" | "suburbSlug" | "state" | "status">;
  salon: { id: string; name: string };
  /** Their messages the team hasn't read, in the conversation with them. */
  unread: number;
  lastMessageAt: Date | null;
}

/** Someone the salon is talking to, for its Messages page. */
export interface SalonConversationSummary {
  conversationId: string;
  salon: { id: string; name: string };
  seekerId: string;
  name: string;
  lastMessage: ConversationMessage | null;
  lastMessageAt: Date;
  /** Their messages the team hasn't read. */
  unread: number;
}

export interface SalonThread {
  seekerId: string;
  name: string;
  applications: ConversationApplication[];
  messages: ConversationMessage[];
  blocker: MessageBlocker | null;
}

/** Applicants to the jobs of some salons: one salon's team, or everyone a person manages. */
function applicantQueries(db: Db, salonIds: string[]) {
  const base = (filters: Omit<ApplicantFilters, "status" | "sort" | "limit">): SQL[] => {
    const where: SQL[] = [
      salonIds.length ? inArray(jobs.salonId, salonIds) : sql`false`,
      isNull(users.suspendedAt),
    ];
    if (filters.jobId) where.push(eq(applications.jobId, filters.jobId));
    if (filters.unread) where.push(sql`${unreadForApplication("seeker")} > 0`);
    for (const kind of filters.verified ?? []) {
      where.push(
        sql`exists (select 1 from ${seekerChecks} c where c.user_id = ${applications.seekerId}
          and c.kind = ${kind} and c.status = 'verified')`,
      );
    }
    if (filters.openToWork) where.push(eq(seekerProfiles.openToWork, true));
    if (filters.minYears !== undefined) {
      where.push(sql`coalesce(${seekerProfiles.yearsExperience}, 0) >= ${filters.minYears}`);
    }
    if (filters.q?.trim()) {
      const pattern = contains(filters.q.trim());
      where.push(
        sql`(${seekerProfiles.firstName} || ' ' || ${seekerProfiles.lastName} ilike ${pattern}
          or ${users.name} ilike ${pattern})`,
      );
    }
    return where;
  };

  const ORDER: Record<ApplicantSort, SQL[]> = {
    newest: [desc(applications.createdAt)],
    oldest: [asc(applications.createdAt)],
    experience: [
      sql`${seekerProfiles.yearsExperience} desc nulls last`,
      desc(applications.createdAt),
    ],
    message: [sql`${lastMessageForApplication} desc nulls last`, desc(applications.createdAt)],
  };

  const select = () =>
    db
      .select({
        application: applications,
        job: {
          id: jobs.id,
          salonId: jobs.salonId,
          title: jobs.title,
          slug: jobs.slug,
          suburbSlug: jobs.suburbSlug,
          state: jobs.state,
          status: jobs.status,
        },
        salon: { id: salons.id, name: salons.name },
        email: users.email,
        phoneNumber: users.phoneNumber,
        profile: seekerProfiles,
        unread: unreadForApplication("seeker"),
        lastMessageAt: lastMessageForApplication,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(salons, eq(salons.id, jobs.salonId))
      .innerJoin(users, eq(users.id, applications.seekerId))
      .leftJoin(seekerProfiles, eq(seekerProfiles.userId, applications.seekerId));

  type Row = Awaited<ReturnType<ReturnType<typeof select>["where"]>>[number];

  const toApplicants = async (rows: Row[], viewed: Set<string>): Promise<SalonApplicant[]> => {
    const checks = await summariesFor(
      db,
      rows.map((r) => r.application.seekerId),
    );
    return rows.map((r) => {
      const isNew = r.application.status === "submitted";
      const contact: Contact = {
        userId: r.application.seekerId,
        email: r.email,
        phoneNumber: r.phoneNumber,
      };
      return {
        application: {
          ...r.application,
          status: isNew && viewed.has(r.application.id) ? "viewed" : r.application.status,
        } as Application,
        isNew,
        user: { id: r.application.seekerId, ...contact },
        profile: r.profile as SeekerProfile | null,
        checks: checks.get(r.application.seekerId) as CheckSummary,
        job: r.job as SalonApplicant["job"],
        salon: r.salon,
        unread: r.unread,
        lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt) : null,
      };
    });
  };

  /** New applications become viewed when the team sees them. */
  const markViewed = async (rows: Row[], actor: Actor) => {
    const fresh = rows.filter((r) => r.application.status === "submitted");
    if (!fresh.length) return new Set<string>();
    const salonOf = new Map(fresh.map((r) => [r.application.id, r.job.salonId]));
    await db.transaction(async (tx) => {
      const changed = await tx
        .update(applications)
        .set({ status: "viewed" })
        .where(
          and(inArray(applications.id, [...salonOf.keys()]), eq(applications.status, "submitted")),
        )
        .returning({ id: applications.id });
      // One audit line per salon, as when one salon's team looks.
      const perSalon = new Map<string, number>();
      for (const { id } of changed) {
        const salon = salonOf.get(id) as string;
        perSalon.set(salon, (perSalon.get(salon) ?? 0) + 1);
      }
      for (const [targetId, count] of perSalon) {
        await recordAudit(tx, actor, {
          action: "applications.viewed",
          targetType: "salon",
          targetId,
          after: { count },
        });
      }
    });
    return new Set(salonOf.keys());
  };

  /**
   * Everyone who applied for the salons' jobs, filtered and sorted, with how many there are of each
   * status under the other filters. The new ones shown become viewed.
   */
  async function search(
    filters: ApplicantFilters,
    actor: Actor,
  ): Promise<{
    items: SalonApplicant[];
    counts: Record<ApplicationStatus, number>;
    total: number;
  }> {
    const where = base(filters);
    const [countRows, rows] = await Promise.all([
      db
        .select({ status: applications.status, n: sql<number>`count(*)::int` })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(users, eq(users.id, applications.seekerId))
        .leftJoin(seekerProfiles, eq(seekerProfiles.userId, applications.seekerId))
        .where(and(...where))
        .groupBy(applications.status),
      select()
        .where(and(...where, ...(filters.status ? [eq(applications.status, filters.status)] : [])))
        .orderBy(...ORDER[filters.sort])
        .limit(filters.limit),
    ]);
    const counts = Object.fromEntries(APPLICATION_STATUS_VALUES.map((s) => [s, 0])) as Record<
      ApplicationStatus,
      number
    >;
    for (const row of countRows) counts[row.status] = row.n;
    const viewed = await markViewed(rows, actor);
    return {
      items: await toApplicants(rows, viewed),
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  return { select, toApplicants, markViewed, search };
}

/** Conversations of some salons, latest first (the last 200), without banned people. */
async function conversationsOf(db: Db, salonIds: string[]): Promise<SalonConversationSummary[]> {
  if (!salonIds.length) return [];
  const rows = await db
    .select({
      conversation: conversations,
      salonName: salons.name,
      firstName: seekerProfiles.firstName,
      lastName: seekerProfiles.lastName,
      unread: unreadIn("seeker"),
    })
    .from(conversations)
    .innerJoin(salons, eq(salons.id, conversations.salonId))
    .innerJoin(users, eq(users.id, conversations.seekerId))
    .leftJoin(seekerProfiles, eq(seekerProfiles.userId, conversations.seekerId))
    .where(and(inArray(conversations.salonId, salonIds), isNull(users.suspendedAt)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
  const last = await lastMessages(
    db,
    rows.map((r) => r.conversation.id),
  );
  return rows.map((r) => ({
    conversationId: r.conversation.id,
    salon: { id: r.conversation.salonId, name: r.salonName },
    seekerId: r.conversation.seekerId,
    name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    lastMessage: last.get(r.conversation.id) ?? null,
    lastMessageAt: r.conversation.lastMessageAt,
    unread: r.unread,
  }));
}

/** How many conversations of each salon have messages the team hasn't read. */
async function unreadBySalon(db: Db, salonIds: string[]): Promise<Map<string, number>> {
  if (!salonIds.length) return new Map();
  const rows = await db
    .select({ salonId: conversations.salonId, n: sql<number>`count(*)::int` })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.seekerId))
    .where(
      and(
        inArray(conversations.salonId, salonIds),
        isNull(users.suspendedAt),
        sql`${unreadIn("seeker")} > 0`,
      ),
    )
    .groupBy(conversations.salonId);
  return new Map(rows.map((r) => [r.salonId, r.n]));
}

/**
 * Everything a person handles across every salon they're on the team of (D-20): jobs, applicants,
 * conversations and unread counts, in one place. Acting on one still goes through that salon's own
 * scope (`salonScope`, `salonConversations`), after the API checks the person's role there.
 */
export async function employerDesk(db: Db, userId: string) {
  const mine = await salonsFor(db).ofUser(userId);
  const salonIds = mine.map((m) => m.salon.id);
  /** A salon of theirs, or none of them for any other ID. */
  const only = (salonId: string | undefined) =>
    salonId === undefined ? salonIds : salonIds.filter((id) => id === salonId);
  return {
    salons: mine,
    async jobs(salonId?: string): Promise<SalonJob[]> {
      const ids = only(salonId);
      return ids.length ? jobsWithCounts(db, inArray(jobs.salonId, ids)) : [];
    },
    search: (filters: ApplicantFilters, actor: Actor) =>
      applicantQueries(db, only(filters.salonId)).search(filters, actor),
    conversations: (salonId?: string) => conversationsOf(db, only(salonId)),
    unreadBySalon: () => unreadBySalon(db, salonIds),
  };
}

export function salonConversations(db: Db, salonId: string) {
  const { select, toApplicants, markViewed, search } = applicantQueries(db, [salonId]);

  async function salonRow(tx: Executor = db): Promise<Salon> {
    const [row] = await tx.select().from(salons).where(eq(salons.id, salonId));
    if (!row) throw new ApiError("not_found", { detail: "No such salon", hint: "Check the ID." });
    return row as Salon;
  }

  async function applicantRow(applicationId: string) {
    const [row] = await select().where(
      and(eq(applications.id, applicationId), eq(jobs.salonId, salonId), isNull(users.suspendedAt)),
    );
    if (!row) {
      throw new ApiError("not_found", {
        detail: "No application to your salon with that ID",
        hint: "List your applicants with GET /v1/employer/salons/{salonId}/applicants and use an `id` from there.",
      });
    }
    return row;
  }

  /** Someone the salon may see (D-13), with their name; not found otherwise. */
  async function personOf(seekerId: string, tx: Executor = db) {
    const found = await salonAccessOf(tx, salonId, seekerId);
    if (!found?.access.view) throw notFoundCandidate();
    const [profile] = await tx
      .select({ firstName: seekerProfiles.firstName, lastName: seekerProfiles.lastName })
      .from(seekerProfiles)
      .where(eq(seekerProfiles.userId, seekerId));
    return {
      ...found,
      firstName: profile?.firstName ?? "",
      name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : "",
    };
  }

  return {
    /** Everyone who applied for the salon's jobs (see `applicantQueries`). */
    search,

    /** The salon's conversations, latest first (the last 200), without banned people. */
    list: () => conversationsOf(db, [salonId]),

    /**
     * The conversation with someone the salon may see (it may have no messages yet). Opening it
     * marks their messages read.
     */
    async thread(seekerId: string): Promise<SalonThread> {
      const person = await personOf(seekerId);
      const [salon, found, applied] = await Promise.all([
        salonRow(),
        findConversation(db, salonId, seekerId),
        applicationsBetween(db, salonId, seekerId),
      ]);
      if (found) {
        await db
          .update(conversations)
          .set({ salonReadAt: new Date() })
          .where(eq(conversations.id, found.id));
      }
      return {
        seekerId,
        name: person.name,
        applications: applied,
        messages: found ? await messagesOf(db, found.id) : [],
        blocker: messageBlockerOf({
          side: "salon",
          salonActive: salon.status === "active",
          salonHasWritten: true,
          takesMessages: person.access.message,
        }),
      };
    },

    /**
     * One application, with how many of the applicant's messages the team hasn't read (the
     * conversation itself is on the Messages page, D-19). Opening it marks a new one viewed.
     */
    async application(applicationId: string, actor: Actor): Promise<SalonApplicant> {
      const row = await applicantRow(applicationId);
      const viewed = await markViewed([row], actor);
      const [applicant] = await toApplicants([row], viewed);
      return applicant as SalonApplicant;
    },

    /**
     * A message from someone on the team: about an application, or to someone found by their
     * profile, within the cold limits (D-19). Returns it, with who to tell.
     */
    async send(
      seekerId: string,
      input: { senderId: string; body: string; applicationId?: string | null | undefined },
      actor: Actor,
    ): Promise<{
      message: ConversationMessage;
      conversationId: string;
      contact: Contact;
      firstName: string;
      salon: Salon;
      room: string;
    }> {
      return db.transaction(async (tx) => {
        // One salon's messages happen one at a time, so two at once can't both pass the limits.
        const [locked] = await tx.select().from(salons).where(eq(salons.id, salonId)).for("update");
        const salon = locked as Salon;
        const person = await personOf(seekerId, tx);
        const blocker = messageBlockerOf({
          side: "salon",
          salonActive: salon?.status === "active",
          salonHasWritten: true,
          takesMessages: person.access.message,
        });
        if (blocker) throw BLOCKED[blocker]();
        const applicationId = await aboutApplication(tx, salonId, seekerId, input.applicationId);
        const existing = await findConversation(tx, salonId, seekerId);
        const replied = existing
          ? Boolean(
              (
                await tx
                  .select({ id: conversationMessages.id })
                  .from(conversationMessages)
                  .where(
                    and(
                      eq(conversationMessages.conversationId, existing.id),
                      eq(conversationMessages.from, "seeker"),
                    ),
                  )
                  .limit(1)
              )[0],
            )
          : false;
        const cold = !person.applied && !replied;
        if (cold) {
          const dayAgo = new Date(Date.now() - DAY_MS);
          const [today] = await tx
            .select({
              people: sql<number>`count(distinct ${conversationMessages.conversationId})::int`,
              person: sql<number>`count(*) filter (where ${conversations.seekerId} = ${seekerId})::int`,
            })
            .from(conversationMessages)
            .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
            .where(
              and(
                eq(conversations.salonId, salonId),
                eq(conversationMessages.from, "salon"),
                eq(conversationMessages.kind, "text"),
                sql`${conversationMessages.createdAt} > ${dayAgo}`,
                // Still cold: they haven't applied here or replied.
                sql`not exists (select 1 from ${conversationMessages} r
                  where r.conversation_id = ${conversations.id} and r."from" = 'seeker')`,
                sql`not exists (select 1 from ${applications} a join ${jobs} j on j.id = a.job_id
                  where a.seeker_id = ${conversations.seekerId} and j.salon_id = ${salonId})`,
              ),
            );
          // The same person's cold messages from every salon they're on.
          const [mine] = await tx
            .select({
              people: sql<number>`count(distinct ${conversationMessages.conversationId})::int`,
            })
            .from(conversationMessages)
            .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
            .where(
              and(
                eq(conversationMessages.senderId, input.senderId),
                eq(conversationMessages.from, "salon"),
                eq(conversationMessages.kind, "text"),
                sql`${conversationMessages.createdAt} > ${dayAgo}`,
                sql`not exists (select 1 from ${conversationMessages} r
                  where r.conversation_id = ${conversations.id} and r."from" = 'seeker')`,
                sql`not exists (select 1 from ${applications} a join ${jobs} j on j.id = a.job_id
                  where a.seeker_id = ${conversations.seekerId} and j.salon_id = ${conversations.salonId})`,
              ),
            );
          const limit = contactLimitReached({
            kind: "message",
            cold,
            salonColdToday: today?.people ?? 0,
            personToday: today?.person ?? 0,
            senderColdToday: mine?.people ?? 0,
          });
          if (limit) {
            throw new ApiError("rate_limited", {
              detail: CONTACT_LIMIT_DETAIL[limit],
              hint: "Try again tomorrow, or once they reply.",
            });
          }
        }
        const conversationId = existing?.id ?? (await conversationFor(tx, salonId, seekerId));
        const message = await addMessage(tx, {
          conversationId,
          from: "salon",
          senderId: input.senderId,
          body: input.body,
          applicationId,
        });
        await recordAudit(tx, actor, {
          action: "conversation.message_sent",
          targetType: "conversation",
          targetId: conversationId,
          after: { from: "salon", messageId: message.id, salonId, seekerId, cold },
        });
        return {
          message,
          conversationId,
          contact: person.contact,
          firstName: person.firstName,
          salon,
          room: roomOf(salonId, seekerId),
        };
      });
    },

    /**
     * Checks the salon may see this person, for the live conversation (D-18). Returns its room and
     * the name the job seeker sees while someone on the team is typing.
     */
    async live(seekerId: string): Promise<{ room: string; name: string }> {
      await personOf(seekerId);
      return { room: roomOf(salonId, seekerId), name: (await salonRow()).name };
    },

    /** The room for an application's conversation (D-18). */
    async applicationRoom(applicationId: string): Promise<string> {
      const row = await applicantRow(applicationId);
      return roomOf(salonId, row.application.seekerId);
    },

    /** Conversations with messages the team hasn't read. */
    async unreadCount(): Promise<number> {
      return (await unreadBySalon(db, [salonId])).get(salonId) ?? 0;
    },
  };
}

// ---------- The job seeker's side ----------

export interface SeekerConversationSummary {
  conversationId: string;
  salon: Salon;
  lastMessage: ConversationMessage | null;
  lastMessageAt: Date;
  /** The salon's messages they haven't read. */
  unread: number;
  /** They hid their profile from this salon (D-13). */
  hidden: boolean;
}

export interface SeekerThread extends SeekerConversationSummary {
  applications: ConversationApplication[];
  messages: ConversationMessage[];
  blocker: MessageBlocker | null;
}

export interface SeekerApplication {
  application: Application;
  job: Job;
  salon: Salon;
  /** Their conversation with the salon, once the salon has written or looked at their number. */
  conversationId: string | null;
  /** The salon's messages they haven't read there. */
  unread: number;
}

export function seekerConversations(db: Db, userId: string) {
  const summaries = async (where: SQL): Promise<SeekerConversationSummary[]> => {
    const rows = await db
      .select({
        conversation: conversations,
        salon: salons,
        unread: unreadIn("salon"),
        hidden: seekerHiddenSalons.salonId,
      })
      .from(conversations)
      .innerJoin(salons, eq(salons.id, conversations.salonId))
      .leftJoin(
        seekerHiddenSalons,
        and(
          eq(seekerHiddenSalons.userId, userId),
          eq(seekerHiddenSalons.salonId, conversations.salonId),
        ),
      )
      .where(and(eq(conversations.seekerId, userId), where))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(200);
    const last = await lastMessages(
      db,
      rows.map((r) => r.conversation.id),
    );
    return rows.map((r) => ({
      conversationId: r.conversation.id,
      salon: r.salon as Salon,
      lastMessage: last.get(r.conversation.id) ?? null,
      lastMessageAt: r.conversation.lastMessageAt,
      unread: r.unread,
      hidden: r.hidden !== null,
    }));
  };

  async function own(conversationId: string): Promise<SeekerConversationSummary> {
    const [row] = await summaries(eq(conversations.id, conversationId));
    if (!row) {
      throw new ApiError("not_found", {
        detail: "You have no conversation with that ID",
        hint: "List your conversations with GET /v1/me/conversations and use an `id` from there.",
      });
    }
    return row;
  }

  const blockerFor = async (tx: Executor, salon: Salon, conversationId: string | null) =>
    messageBlockerOf({
      side: "seeker",
      salonActive: salon.status === "active",
      salonHasWritten: conversationId ? await salonHasWritten(tx, conversationId) : false,
    });

  const markRead = (conversationId: string) =>
    db
      .update(conversations)
      .set({ seekerReadAt: new Date() })
      .where(eq(conversations.id, conversationId));

  return {
    /** Their conversations with salons, latest first. */
    list: () => summaries(sql`true`),

    /** One conversation. Opening it marks the salon's messages read. */
    async thread(conversationId: string): Promise<SeekerThread> {
      const row = await own(conversationId);
      await markRead(conversationId);
      const [messages, applied, blocker] = await Promise.all([
        messagesOf(db, conversationId),
        applicationsBetween(db, row.salon.id, userId),
        blockerFor(db, row.salon, conversationId),
      ]);
      return { ...row, unread: 0, applications: applied, messages, blocker };
    },

    /** One of their applications, and their conversation with that salon (unread, not opened). */
    async application(applicationId: string): Promise<SeekerApplication> {
      const [row] = await db
        .select({ application: applications, job: jobs, salon: salons })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(and(eq(applications.id, applicationId), eq(applications.seekerId, userId)));
      if (!row) {
        throw new ApiError("not_found", {
          detail: "You have no application with that ID",
          hint: "List your applications with GET /v1/me/applications and use an `id` from there.",
        });
      }
      const [found] = await summaries(eq(conversations.salonId, row.salon.id));
      return {
        application: row.application as Application,
        job: row.job as Job,
        salon: row.salon as Salon,
        conversationId: found?.conversationId ?? null,
        unread: found?.unread ?? 0,
      };
    },

    /**
     * Their reply, once the salon has written. It's about the application given, or else the one
     * the salon last wrote about. Returns it, with who on the team to tell.
     */
    async send(
      conversationId: string,
      input: { body: string; applicationId?: string | null | undefined },
      actor: Actor,
    ): Promise<{
      message: ConversationMessage;
      salon: Salon;
      senderName: string;
      team: Contact[];
      room: string;
    }> {
      const row = await own(conversationId);
      return db.transaction(async (tx) => {
        await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .for("update");
        const blocker = await blockerFor(tx, row.salon, conversationId);
        if (blocker) throw BLOCKED[blocker]();
        let applicationId = await aboutApplication(tx, row.salon.id, userId, input.applicationId);
        if (!applicationId) {
          const [latest] = await tx
            .select({ applicationId: conversationMessages.applicationId })
            .from(conversationMessages)
            .where(
              and(
                eq(conversationMessages.conversationId, conversationId),
                eq(conversationMessages.from, "salon"),
                eq(conversationMessages.kind, "text"),
              ),
            )
            .orderBy(desc(conversationMessages.createdAt))
            .limit(1);
          applicationId = latest?.applicationId ?? null;
        }
        const message = await addMessage(tx, {
          conversationId,
          from: "seeker",
          senderId: userId,
          body: input.body,
          applicationId,
        });
        await recordAudit(tx, actor, {
          action: "conversation.message_sent",
          targetType: "conversation",
          targetId: conversationId,
          after: { from: "seeker", messageId: message.id, salonId: row.salon.id },
        });
        const [profile] = await tx
          .select({ firstName: seekerProfiles.firstName, lastName: seekerProfiles.lastName })
          .from(seekerProfiles)
          .where(eq(seekerProfiles.userId, userId));
        const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : "";
        return {
          message,
          salon: row.salon,
          senderName: name || "A job seeker",
          team: await teamToTell(tx, row.salon.id, conversationId, applicationId),
          room: roomOf(row.salon.id, userId),
        };
      });
    },

    /**
     * Checks the conversation is theirs, for it live (D-18). Returns its room and the name the
     * salon's team sees while they're typing.
     */
    async live(conversationId: string): Promise<{ room: string; name: string }> {
      const row = await own(conversationId);
      const [profile] = await db
        .select({ firstName: seekerProfiles.firstName })
        .from(seekerProfiles)
        .where(eq(seekerProfiles.userId, userId));
      return { room: roomOf(row.salon.id, userId), name: profile?.firstName || "The job seeker" };
    },

    /** The salon messages they haven't read, across all their conversations. */
    async unreadCount(): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`coalesce(sum(${unreadIn("salon")}), 0)::int` })
        .from(conversations)
        .where(eq(conversations.seekerId, userId));
      return row?.n ?? 0;
    },
  };
}

/**
 * Who on the team hears about a job seeker's reply: the people the job names, when it's about an
 * application; otherwise those on the team who've written in the conversation; and failing those,
 * everyone. Only people still on the team, and not banned.
 */
async function teamToTell(
  tx: Executor,
  salonId: string,
  conversationId: string,
  applicationId: string | null,
): Promise<Contact[]> {
  const members = (ids: string[] | null) =>
    tx
      .select({ userId: users.id, email: users.email, phoneNumber: users.phoneNumber })
      .from(salonMembers)
      .innerJoin(users, eq(users.id, salonMembers.userId))
      .where(
        and(
          eq(salonMembers.salonId, salonId),
          isNull(users.suspendedAt),
          ids ? inArray(salonMembers.userId, ids) : undefined,
        ),
      );
  if (applicationId) {
    const [job] = await tx
      .select({ notifyUserIds: jobs.notifyUserIds })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(applications.id, applicationId));
    // The job's choice: null is everyone, an empty list nobody.
    const chosen = job?.notifyUserIds ?? null;
    if (chosen && chosen.length === 0) return [];
    return members(chosen);
  }
  const writers = await tx
    .selectDistinct({ id: conversationMessages.senderId })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.from, "salon"),
      ),
    );
  const ids = writers.map((w) => w.id).filter((id): id is string => id !== null);
  const still = ids.length ? await members(ids) : [];
  return still.length ? still : members(null);
}

/** Unread salon messages per application (in the conversation with its salon), for job seekers. */
export const seekerUnreadSql = unreadForApplication("salon");
