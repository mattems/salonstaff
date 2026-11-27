/**
 * Conversations on applications (D-17): the salon's team and the applicant, and the salon's view of
 * everyone who applied, filtered. `salonConversations` is scoped to one salon; `seekerConversations`
 * to one applicant.
 */
import {
  APPLICATION_STATUS_VALUES,
  ApiError,
  type ApplicantSort,
  type ApplicationStatus,
  type MessageBlocker,
  messageBlockerOf,
} from "@salonstaff/shared";
import { and, asc, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import { type CheckSummary, summariesFor } from "./checks";
import type { Db } from "./index";
import { contains } from "./like";
import type { Applicant, Contact } from "./salon";
import {
  applicationMessages,
  applications,
  jobs,
  salons,
  seekerChecks,
  seekerProfiles,
  users,
} from "./schema";
import type { Application, SeekerProfile } from "./seeker";
import type { Job, Salon } from "./visibility";

export type ApplicationMessage = typeof applicationMessages.$inferSelect & {
  /** Who wrote it, as the other side sees them: a first name. Null once their account is gone. */
  senderName: string | null;
};

const EPOCH = sql`'epoch'::timestamptz`;

/** Messages from `from` after the other side last read the conversation. */
const unreadFrom = (from: "salon" | "seeker") => {
  const readAt = from === "seeker" ? applications.salonReadAt : applications.seekerReadAt;
  return sql<number>`(select count(*)::int from ${applicationMessages} m
    where m.application_id = ${applications.id} and m."from" = ${from}
    and m.created_at > coalesce(${readAt}, ${EPOCH}))`;
};

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? null;

async function messagesOf(tx: Executor, applicationId: string): Promise<ApplicationMessage[]> {
  const rows = await tx
    .select({ message: applicationMessages, name: users.name })
    .from(applicationMessages)
    .leftJoin(users, eq(users.id, applicationMessages.senderId))
    .where(eq(applicationMessages.applicationId, applicationId))
    .orderBy(asc(applicationMessages.createdAt));
  return rows.map((r) => ({ ...r.message, senderName: firstName(r.name) }));
}

async function salonHasWritten(tx: Executor, applicationId: string) {
  const [row] = await tx
    .select({ id: applicationMessages.id })
    .from(applicationMessages)
    .where(
      and(
        eq(applicationMessages.applicationId, applicationId),
        eq(applicationMessages.from, "salon"),
      ),
    )
    .limit(1);
  return Boolean(row);
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
      hint: "You can reply once the salon messages you about your application. Your cover note is with them already.",
    }),
};

// ---------- The salon's side ----------

export interface ApplicantFilters {
  jobId?: string | undefined;
  status?: ApplicationStatus | undefined;
  /** Only applicants with replies the team hasn't read. */
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
  job: Pick<Job, "id" | "title" | "slug" | "suburbSlug" | "state" | "status">;
  /** Their messages the team hasn't read. */
  unread: number;
  lastMessageAt: Date | null;
}

export interface SalonThread {
  applicant: SalonApplicant;
  salon: Salon;
  messages: ApplicationMessage[];
  blocker: MessageBlocker | null;
}

export function salonConversations(db: Db, salonId: string) {
  const base = (filters: Omit<ApplicantFilters, "status" | "sort" | "limit">): SQL[] => {
    const where: SQL[] = [eq(jobs.salonId, salonId), isNull(users.suspendedAt)];
    if (filters.jobId) where.push(eq(applications.jobId, filters.jobId));
    if (filters.unread) where.push(sql`${unreadFrom("seeker")} > 0`);
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
    message: [sql`${applications.lastMessageAt} desc nulls last`, desc(applications.createdAt)],
  };

  const select = () =>
    db
      .select({
        application: applications,
        job: {
          id: jobs.id,
          title: jobs.title,
          slug: jobs.slug,
          suburbSlug: jobs.suburbSlug,
          state: jobs.state,
          status: jobs.status,
        },
        email: users.email,
        phoneNumber: users.phoneNumber,
        profile: seekerProfiles,
        unread: unreadFrom("seeker"),
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
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
        unread: r.unread,
        lastMessageAt: r.application.lastMessageAt,
      };
    });
  };

  /** New applications become viewed when the team sees them. */
  const markViewed = async (ids: string[], actor: Actor) => {
    if (!ids.length) return;
    await db.transaction(async (tx) => {
      const changed = await tx
        .update(applications)
        .set({ status: "viewed" })
        .where(and(inArray(applications.id, ids), eq(applications.status, "submitted")))
        .returning({ id: applications.id });
      if (changed.length) {
        await recordAudit(tx, actor, {
          action: "applications.viewed",
          targetType: "salon",
          targetId: salonId,
          after: { count: changed.length },
        });
      }
    });
  };

  async function salonRow(): Promise<Salon> {
    const [row] = await db.select().from(salons).where(eq(salons.id, salonId));
    if (!row) throw new ApiError("not_found", { detail: "No such salon", hint: "Check the ID." });
    return row as Salon;
  }

  async function applicantRow(applicationId: string): Promise<Row> {
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

  return {
    /**
     * Everyone who applied for the salon's jobs, filtered and sorted, with how many there are of each
     * status under the other filters. The new ones shown become viewed.
     */
    async search(
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
          .where(
            and(...where, ...(filters.status ? [eq(applications.status, filters.status)] : [])),
          )
          .orderBy(...ORDER[filters.sort])
          .limit(filters.limit),
      ]);
      const counts = Object.fromEntries(APPLICATION_STATUS_VALUES.map((s) => [s, 0])) as Record<
        ApplicationStatus,
        number
      >;
      for (const row of countRows) counts[row.status] = row.n;
      const fresh = rows
        .filter((r) => r.application.status === "submitted")
        .map((r) => r.application.id);
      await markViewed(fresh, actor);
      return {
        items: await toApplicants(rows, new Set(fresh)),
        counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      };
    },

    /** One application's conversation. Opening it marks the applicant's messages read. */
    async thread(applicationId: string, actor: Actor): Promise<SalonThread> {
      const row = await applicantRow(applicationId);
      const fresh = row.application.status === "submitted" ? [row.application.id] : [];
      await markViewed(fresh, actor);
      await db
        .update(applications)
        .set({ salonReadAt: new Date() })
        .where(eq(applications.id, applicationId));
      const [salon, messages] = await Promise.all([salonRow(), messagesOf(db, applicationId)]);
      const [applicant] = await toApplicants([{ ...row, unread: 0 }], new Set(fresh));
      return {
        applicant: applicant as SalonApplicant,
        salon,
        messages,
        blocker: messageBlockerOf({
          side: "salon",
          salonActive: salon.status === "active",
          salonHasWritten: true,
        }),
      };
    },

    /** A message from someone on the team. Returns it, with who to tell. */
    async send(
      applicationId: string,
      input: { senderId: string; body: string },
      actor: Actor,
    ): Promise<{
      message: ApplicationMessage;
      contact: Contact;
      firstName: string;
      job: SalonApplicant["job"];
      salon: Salon;
    }> {
      const row = await applicantRow(applicationId);
      return db.transaction(async (tx) => {
        // One application's messages happen one at a time, so two at once can't both pass the limit.
        await tx
          .select({ id: applications.id })
          .from(applications)
          .where(eq(applications.id, applicationId))
          .for("update");
        const [salon] = await tx.select().from(salons).where(eq(salons.id, salonId));
        const blocker = messageBlockerOf({
          side: "salon",
          salonActive: salon?.status === "active",
          salonHasWritten: true,
        });
        if (blocker) throw BLOCKED[blocker]();
        const now = new Date();
        const [message] = await tx
          .insert(applicationMessages)
          .values({
            applicationId,
            from: "salon",
            senderId: input.senderId,
            body: input.body,
            createdAt: now,
          })
          .returning();
        await tx
          .update(applications)
          .set({ lastMessageAt: now, salonReadAt: now })
          .where(eq(applications.id, applicationId));
        await recordAudit(tx, actor, {
          action: "application.message_sent",
          targetType: "application",
          targetId: applicationId,
          after: { from: "salon", messageId: message?.id },
        });
        const [sender] = await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, input.senderId));
        return {
          message: {
            ...(message as typeof applicationMessages.$inferSelect),
            senderName: firstName(sender?.name ?? null),
          },
          contact: {
            userId: row.application.seekerId,
            email: row.email,
            phoneNumber: row.phoneNumber,
          },
          firstName: row.profile?.firstName ?? "",
          job: row.job as SalonApplicant["job"],
          salon: salon as Salon,
        };
      });
    },

    /**
     * Checks the application is one of this salon's, for its live conversation (D-18). Returns the
     * name the applicant sees while someone on the team is typing.
     */
    async live(applicationId: string): Promise<{ name: string }> {
      await applicantRow(applicationId);
      return { name: (await salonRow()).name };
    },

    /** Applications with replies the team hasn't read. */
    async unreadCount(): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(users, eq(users.id, applications.seekerId))
        .where(
          and(
            eq(jobs.salonId, salonId),
            isNull(users.suspendedAt),
            sql`${unreadFrom("seeker")} > 0`,
          ),
        );
      return row?.n ?? 0;
    },
  };
}

// ---------- The applicant's side ----------

export interface SeekerThreadSummary {
  application: Application;
  job: Job;
  salon: Salon;
  lastMessage: ApplicationMessage | null;
  /** The salon's messages they haven't read. */
  unread: number;
}

export interface SeekerThread extends SeekerThreadSummary {
  messages: ApplicationMessage[];
  blocker: MessageBlocker | null;
}

export function seekerConversations(db: Db, userId: string) {
  async function own(applicationId: string) {
    const [row] = await db
      .select({ application: applications, job: jobs, salon: salons, unread: unreadFrom("salon") })
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
    return row;
  }

  return {
    /** Conversations with at least one message, latest first. */
    async list(): Promise<SeekerThreadSummary[]> {
      const rows = await db
        .select({
          application: applications,
          job: jobs,
          salon: salons,
          unread: unreadFrom("salon"),
        })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(
          and(eq(applications.seekerId, userId), sql`${applications.lastMessageAt} is not null`),
        )
        .orderBy(desc(applications.lastMessageAt));
      const ids = rows.map((r) => r.application.id);
      const last = ids.length
        ? await db
            .selectDistinctOn([applicationMessages.applicationId], {
              message: applicationMessages,
              name: users.name,
            })
            .from(applicationMessages)
            .leftJoin(users, eq(users.id, applicationMessages.senderId))
            .where(inArray(applicationMessages.applicationId, ids))
            .orderBy(applicationMessages.applicationId, desc(applicationMessages.createdAt))
        : [];
      const lastBy = new Map(
        last.map((l) => [l.message.applicationId, { ...l.message, senderName: firstName(l.name) }]),
      );
      return rows.map((r) => ({
        application: r.application as Application,
        job: r.job as Job,
        salon: r.salon as Salon,
        lastMessage: lastBy.get(r.application.id) ?? null,
        unread: r.unread,
      }));
    },

    /** One conversation. Opening it marks the salon's messages read. */
    async thread(applicationId: string): Promise<SeekerThread> {
      const row = await own(applicationId);
      await db
        .update(applications)
        .set({ seekerReadAt: new Date() })
        .where(eq(applications.id, applicationId));
      const [messages, written] = await Promise.all([
        messagesOf(db, applicationId),
        salonHasWritten(db, applicationId),
      ]);
      return {
        application: row.application as Application,
        job: row.job as Job,
        salon: row.salon as Salon,
        messages,
        lastMessage: messages.at(-1) ?? null,
        unread: 0,
        blocker: messageBlockerOf({
          side: "seeker",
          salonActive: row.salon.status === "active",
          salonHasWritten: written,
        }),
      };
    },

    /** The applicant's reply. Returns it, with the job and salon to tell. */
    async send(
      applicationId: string,
      body: string,
      actor: Actor,
    ): Promise<{ message: ApplicationMessage; job: Job; salon: Salon; senderName: string }> {
      const row = await own(applicationId);
      return db.transaction(async (tx) => {
        await tx
          .select({ id: applications.id })
          .from(applications)
          .where(eq(applications.id, applicationId))
          .for("update");
        const blocker = messageBlockerOf({
          side: "seeker",
          salonActive: row.salon.status === "active",
          salonHasWritten: await salonHasWritten(tx, applicationId),
        });
        if (blocker) throw BLOCKED[blocker]();
        const now = new Date();
        const [message] = await tx
          .insert(applicationMessages)
          .values({ applicationId, from: "seeker", senderId: userId, body, createdAt: now })
          .returning();
        await tx
          .update(applications)
          .set({ lastMessageAt: now, seekerReadAt: now })
          .where(eq(applications.id, applicationId));
        await recordAudit(tx, actor, {
          action: "application.message_sent",
          targetType: "application",
          targetId: applicationId,
          after: { from: "seeker", messageId: message?.id },
        });
        const [profile] = await tx
          .select({ firstName: seekerProfiles.firstName, lastName: seekerProfiles.lastName })
          .from(seekerProfiles)
          .where(eq(seekerProfiles.userId, userId));
        const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : "The applicant";
        return {
          message: {
            ...(message as typeof applicationMessages.$inferSelect),
            senderName: firstName(name),
          },
          job: row.job as Job,
          salon: row.salon as Salon,
          senderName: name,
        };
      });
    },

    /**
     * Checks the application is theirs, for its live conversation (D-18). Returns the name the
     * salon's team sees while they're typing.
     */
    async live(applicationId: string): Promise<{ name: string }> {
      await own(applicationId);
      const [profile] = await db
        .select({ firstName: seekerProfiles.firstName })
        .from(seekerProfiles)
        .where(eq(seekerProfiles.userId, userId));
      return { name: profile?.firstName || "The applicant" };
    },

    /** The salon messages they haven't read, across all their applications. */
    async unreadCount(): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`coalesce(sum(${unreadFrom("salon")}), 0)::int` })
        .from(applications)
        .where(eq(applications.seekerId, userId));
      return row?.n ?? 0;
    },
  };
}

/** Unread salon messages per application, for the applicant's list of applications. */
export const seekerUnreadSql = unreadFrom("salon");
