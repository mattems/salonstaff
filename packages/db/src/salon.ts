/**
 * Salons. `salonsFor(db)` finds and creates them; `salonScope(db, salonId)` is everything one
 * salon's team may read and change: settings, jobs, publishing, applicants and billing (who on the
 * team may do what is decided by the API, D-11). A salon sees only people who applied to its own jobs.
 */
import {
  ApiError,
  type ApplicationStatus,
  type AuState,
  type Entitlement,
  entitlementOf,
  isFoundingSlot,
  type JobInput,
  jobBaseSlug,
  PRICING,
  type SalonInput,
  type SalonUpdate,
  slugify,
  type VerificationStatus,
} from "@salonstaff/shared";
import { and, count, desc, eq, gt, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import { type CheckSummary, summariesFor } from "./checks";
import type { Db } from "./index";
import {
  applications,
  jobs,
  payments,
  type SalonRole,
  salonMembers,
  salons,
  seekerProfiles,
  users,
} from "./schema";
import { type Application, type FullProfile, fullProfileOf, type SeekerProfile } from "./seeker";
import { placeSlug, retryOnSlugClash, samePlace, writeRedirect } from "./slugs";
import { addMember } from "./team";
import { isLive, type Job, type Salon, unclaimed } from "./visibility";

export type Payment = typeof payments.$inferSelect;
export type PaymentKind = Payment["kind"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ABN's state after an Australian Business Register lookup (or none). */
export interface AbnCheck {
  status: VerificationStatus;
  entityName: string | null;
}

export interface Contact {
  /** May be a stand-in address (an account made with a mobile number): check with `isStandInEmail`. */
  email: string;
  phoneNumber: string | null;
}

export interface Applicant {
  application: Application;
  /** Still `submitted` when the salon opened the list: new to them. */
  isNew: boolean;
  user: { id: string } & Contact;
  profile: SeekerProfile | null;
  checks: CheckSummary;
}

export interface Candidate extends FullProfile {
  contact: Contact;
  /** Their applications to this salon's jobs. */
  applications: (Application & { jobTitle: string })[];
}

/** A salon someone is on the team of, with their role there. */
export interface MySalon {
  salon: Salon;
  role: SalonRole;
}

export interface SalonJob extends Job {
  applicants: number;
  newApplicants: number;
}

const salonValues = (input: SalonInput) => ({
  name: input.name,
  abn: input.abn,
  contactName: input.contactName,
  phone: input.phone,
  website: input.website ?? null,
  instagram: input.instagram?.replace(/^@+/, "") || null,
  suburb: input.suburb,
  state: input.state,
  postcode: input.postcode,
  about: input.about ?? null,
});

const jobValues = (input: JobInput) => ({
  title: input.title,
  role: input.role,
  employmentType: input.employmentType,
  payMin: input.payMin ?? null,
  payMax: input.payMax ?? null,
  payPeriod: input.payPeriod,
  suburb: input.suburb,
  state: input.state,
  postcode: input.postcode,
  description: input.description,
  requirements: input.requirements ?? null,
  requireQualification: input.requireQualification,
});

const notFoundJob = () =>
  new ApiError("not_found", {
    detail: "Your salon has no job with that ID",
    hint: "List your jobs with GET /v1/employer/salons/{salonId}/jobs and use an `id` from there.",
  });

const notFoundApplication = () =>
  new ApiError("not_found", {
    detail: "No application with that ID for your salon's jobs",
    hint: "List a job's applicants with GET /v1/employer/salons/{salonId}/jobs/{id}/applicants.",
  });

async function foundingSoFar(tx: Executor): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(salons).where(eq(salons.founding, true));
  return row?.n ?? 0;
}

/** Makes the person an employer (a seeker becomes one by creating or claiming a salon). */
export async function makeEmployer(tx: Executor, userId: string, actor: Actor): Promise<void> {
  const changed = await tx
    .update(users)
    .set({ role: "employer" })
    .where(and(eq(users.id, userId), eq(users.role, "seeker")))
    .returning({ id: users.id });
  if (changed.length > 0) {
    await recordAudit(tx, actor, {
      action: "user.role_changed",
      targetType: "user",
      targetId: userId,
      before: { role: "seeker" },
      after: { role: "employer" },
    });
  }
}

/** A new or claimed salon's launch terms (D-05): the free period, and a founding place if any are left. */
export async function launchTerms(tx: Executor, alreadyFounding = false) {
  return {
    founding: alreadyFounding || isFoundingSlot(await foundingSoFar(tx)),
    freeUntil: new Date(Date.now() + PRICING.freePeriodDays * DAY_MS),
  };
}

export function salonsFor(db: Db) {
  return {
    async byId(id: string): Promise<Salon | null> {
      const [row] = await db.select().from(salons).where(eq(salons.id, id));
      return row ?? null;
    },

    /** The salons a person is on the team of, in the order they joined. */
    async ofUser(userId: string): Promise<MySalon[]> {
      return db
        .select({ salon: salons, role: salonMembers.role })
        .from(salonMembers)
        .innerJoin(salons, eq(salons.id, salonMembers.salonId))
        .where(eq(salonMembers.userId, userId))
        .orderBy(salonMembers.createdAt, salons.name);
    },

    /** The salon, if the person is on its team. */
    async membership(userId: string, salonId: string): Promise<MySalon | null> {
      const [row] = await db
        .select({ salon: salons, role: salonMembers.role })
        .from(salonMembers)
        .innerJoin(salons, eq(salons.id, salonMembers.salonId))
        .where(and(eq(salonMembers.userId, userId), eq(salonMembers.salonId, salonId)));
      return row ?? null;
    },

    /** An unclaimed directory listing with this ABN: its owner should claim it, not make another. */
    async unclaimedListingByAbn(abn: string): Promise<Salon | null> {
      const [row] = await db
        .select()
        .from(salons)
        .where(
          and(
            eq(salons.abn, abn.replace(/\s+/g, "")),
            eq(salons.source, "directory"),
            unclaimed(),
            eq(salons.status, "active"),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    /**
     * A new salon, owned by the person who makes it, with the free period and (if any are left)
     * founding pricing. An account can make any number (D-11).
     */
    async create(ownerId: string, input: SalonInput, abn: AbnCheck, actor: Actor): Promise<Salon> {
      return retryOnSlugClash(() =>
        db.transaction(async (tx) => {
          const place = await placeSlug(tx, "salon", {
            state: input.state,
            suburb: input.suburb,
            base: slugify(input.name),
          });
          const [row] = await tx
            .insert(salons)
            .values({
              ...salonValues(input),
              ...place,
              abnStatus: abn.status,
              abnEntityName: abn.entityName,
              source: "owner",
              ...(await launchTerms(tx)),
            })
            .returning();
          const salon = row as Salon;
          await makeEmployer(tx, ownerId, actor);
          await recordAudit(tx, actor, {
            action: "salon.created",
            targetType: "salon",
            targetId: salon.id,
            after: { name: salon.name, founding: salon.founding },
          });
          await addMember(tx, salon.id, ownerId, "owner", actor);
          return salon;
        }),
      );
    },

    /** A directory listing nobody owns yet (staff add these; the seed does too). */
    async addListing(
      input: {
        name: string;
        suburb: string;
        state: AuState;
        postcode: string;
        abn?: string | null | undefined;
        email?: string | null | undefined;
        phone?: string | null | undefined;
        website?: string | null | undefined;
        address?: string | null | undefined;
        about?: string | null | undefined;
      },
      actor: Actor,
    ): Promise<Salon> {
      return retryOnSlugClash(() =>
        db.transaction(async (tx) => {
          const place = await placeSlug(tx, "salon", {
            state: input.state,
            suburb: input.suburb,
            base: slugify(input.name),
          });
          const abn = input.abn?.replace(/\s+/g, "") || null;
          const [row] = await tx
            .insert(salons)
            .values({
              ...place,
              name: input.name,
              suburb: input.suburb,
              state: input.state,
              postcode: input.postcode,
              abn,
              // Not queued for staff: nobody owns the listing yet, and a claim checks the ABN (D-09).
              abnStatus: "not_started",
              email: input.email?.trim().toLowerCase() || null,
              phone: input.phone || null,
              website: input.website || null,
              address: input.address || null,
              about: input.about || null,
              source: "directory",
            })
            .returning();
          const salon = row as Salon;
          await recordAudit(tx, actor, {
            action: "directory.listing_added",
            targetType: "salon",
            targetId: salon.id,
            after: { name: salon.name },
          });
          return salon;
        }),
      );
    },
  };
}

/**
 * What can change on a salon: what an owner changes in their settings, plus the contact details
 * staff keep up to date on directory listings (D-04), any of which they can clear.
 */
export type SalonChanges = Partial<Omit<SalonUpdate, "phone">> & {
  phone?: string | null | undefined;
  email?: string | null | undefined;
  address?: string | null | undefined;
};

export function salonScope(db: Db, salonId: string) {
  const salonRow = async (tx: Executor = db, lock = false) => {
    const query = tx.select().from(salons).where(eq(salons.id, salonId));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) {
      throw new ApiError("not_found", {
        detail: "That salon no longer exists",
        hint: "List your salons with GET /v1/employer/salons.",
      });
    }
    return row;
  };
  const jobRow = async (tx: Executor, jobId: string, lock = false) => {
    const query = tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.salonId, salonId)));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw notFoundJob();
    return row;
  };

  return {
    get: () => salonRow(),

    entitlement: async (): Promise<Entitlement> => entitlementOf(await salonRow()),

    /**
     * Changes the salon's details. A new name, suburb or state gives it a new address, and the
     * old one redirects; its jobs' addresses (which carry the salon's name) follow.
     */
    async update(input: SalonChanges, abn: AbnCheck | null, actor: Actor): Promise<Salon> {
      return retryOnSlugClash(() =>
        db.transaction(async (tx) => {
          const before = await salonRow(tx, true);
          const name = input.name ?? before.name;
          const state = input.state ?? before.state;
          const suburb = input.suburb ?? before.suburb;
          const place = await placeSlug(
            tx,
            "salon",
            { state, suburb, base: slugify(name) },
            before,
          );
          if (!samePlace(place, before)) await writeRedirect(tx, "salon", before, salonId);
          const changes: Partial<typeof salons.$inferInsert> = { ...place };
          for (const [key, value] of Object.entries(input)) {
            if (value === undefined) continue;
            (changes as Record<string, unknown>)[key] =
              key === "instagram" && value !== null
                ? String(value).replace(/^@+/, "") || null
                : value;
          }
          if (abn) {
            changes.abnStatus = abn.status;
            changes.abnEntityName = abn.entityName;
          }
          const [row] = await tx
            .update(salons)
            .set(changes)
            .where(eq(salons.id, salonId))
            .returning();
          const salon = row as Salon;
          if (name !== before.name) {
            for (const job of await tx.select().from(jobs).where(eq(jobs.salonId, salonId))) {
              await moveJob(tx, job, {
                state: job.state,
                suburb: job.suburb,
                base: jobBaseSlug(job.title, name),
              });
            }
          }
          await recordAudit(tx, actor, {
            action: "salon.updated",
            targetType: "salon",
            targetId: salonId,
            before: Object.fromEntries(
              Object.keys(changes).map((key) => [key, before[key as keyof Salon]]),
            ),
            after: changes,
          });
          return salon;
        }),
      );
    },

    // ---------- Jobs ----------

    async jobs(): Promise<SalonJob[]> {
      return jobsWithCounts(db, eq(jobs.salonId, salonId));
    },

    async job(jobId: string): Promise<SalonJob> {
      const [row] = await jobsWithCounts(
        db,
        and(eq(jobs.salonId, salonId), eq(jobs.id, jobId)) as SQL,
      );
      if (!row) throw notFoundJob();
      return row;
    },

    /** `notifyUserIds`: who on the team hears about applications; null (the default) is everyone. */
    async createJob(
      input: JobInput,
      actor: Actor,
      notifyUserIds: string[] | null = null,
    ): Promise<Job> {
      return retryOnSlugClash(() =>
        db.transaction(async (tx) => {
          const salon = await salonRow(tx);
          const place = await placeSlug(tx, "job", {
            state: input.state,
            suburb: input.suburb,
            base: jobBaseSlug(input.title, salon.name),
          });
          const [row] = await tx
            .insert(jobs)
            .values({ ...jobValues(input), ...place, salonId, status: "draft", notifyUserIds })
            .returning();
          const job = row as Job;
          await recordAudit(tx, actor, {
            action: "job.created",
            targetType: "job",
            targetId: job.id,
            after: { title: job.title },
          });
          return job;
        }),
      );
    },

    /** Changes a job. A new title or place gives it a new address; the old one redirects. */
    async updateJob(
      jobId: string,
      input: JobInput,
      actor: Actor,
      notifyUserIds?: string[] | null,
    ): Promise<Job> {
      return retryOnSlugClash(() =>
        db.transaction(async (tx) => {
          const salon = await salonRow(tx);
          const before = await jobRow(tx, jobId, true);
          await moveJob(tx, before, {
            state: input.state,
            suburb: input.suburb,
            base: jobBaseSlug(input.title, salon.name),
          });
          const [row] = await tx
            .update(jobs)
            .set({
              ...jobValues(input),
              ...(notifyUserIds === undefined ? {} : { notifyUserIds }),
            })
            .where(eq(jobs.id, jobId))
            .returning();
          await recordAudit(tx, actor, {
            action: "job.updated",
            targetType: "job",
            targetId: jobId,
            before: { title: before.title, suburb: before.suburb, state: before.state },
            after: { title: input.title, suburb: input.suburb, state: input.state },
          });
          return row as Job;
        }),
      );
    },

    /**
     * Publishes (or relists) a job for 30 days, paid for by the free period, the Salon Plan or a
     * listing credit, in that order. A credit is used up in the same transaction. A job that is
     * already live is left as it is, and nothing is charged.
     */
    async publish(jobId: string, actor: Actor): Promise<{ job: Job; charged: boolean }> {
      return db.transaction(async (tx) => {
        const salon = await salonRow(tx, true);
        const job = await jobRow(tx, jobId, true);
        if (isLive(job)) return { job, charged: false };
        const entitlement = entitlementOf(salon);
        if (!entitlement.ok) {
          if (entitlement.reason === "suspended") {
            throw new ApiError("salon_suspended", {
              detail: `Your salon is ${salon.status}${salon.statusReason ? `: ${salon.statusReason}` : ""}`,
              hint: "Contact support@salonstaff.com.au to sort it out.",
            });
          }
          throw new ApiError("listing_needed", {
            detail: "Your free period has ended and there's no listing credit or Salon Plan",
            hint: "Buy a single listing or start the Salon Plan with POST /v1/employer/salons/{salonId}/billing/checkout, then publish again.",
          });
        }
        if (entitlement.via === "credit") {
          const used = await tx
            .update(salons)
            .set({ listingCredits: sql`${salons.listingCredits} - 1` })
            .where(and(eq(salons.id, salonId), gt(salons.listingCredits, 0)))
            .returning({ id: salons.id });
          if (used.length === 0) {
            throw new ApiError("listing_needed", {
              detail: "No listing credits left",
              hint: "Buy a single listing with POST /v1/employer/salons/{salonId}/billing/checkout, then publish again.",
            });
          }
        }
        const now = new Date();
        const [row] = await tx
          .update(jobs)
          .set({
            status: "published",
            paidVia: entitlement.via,
            publishedAt: now,
            expiresAt: new Date(now.getTime() + PRICING.listingDurationDays * DAY_MS),
          })
          .where(eq(jobs.id, jobId))
          .returning();
        await recordAudit(tx, actor, {
          action: "job.published",
          targetType: "job",
          targetId: jobId,
          before: { status: job.status },
          after: { status: "published", paidVia: entitlement.via },
        });
        return { job: row as Job, charged: entitlement.via === "credit" };
      });
    },

    async close(jobId: string, actor: Actor): Promise<Job> {
      return db.transaction(async (tx) => {
        const before = await jobRow(tx, jobId, true);
        if (before.status === "closed") return before;
        const [row] = await tx
          .update(jobs)
          .set({ status: "closed" })
          .where(eq(jobs.id, jobId))
          .returning();
        await recordAudit(tx, actor, {
          action: "job.closed",
          targetType: "job",
          targetId: jobId,
          before: { status: before.status },
          after: { status: "closed" },
        });
        return row as Job;
      });
    },

    // ---------- Applicants ----------

    /**
     * Who applied for one of the salon's jobs, newest first. Banned people are left out. Opening
     * the list marks new applications as viewed (`markViewed`).
     */
    async applicants(
      jobId: string,
      options: { markViewed: boolean; actor: Actor },
    ): Promise<{ job: Job; applicants: Applicant[] }> {
      const job = await jobRow(db, jobId);
      const rows = await db
        .select({
          application: applications,
          email: users.email,
          phoneNumber: users.phoneNumber,
          profile: seekerProfiles,
        })
        .from(applications)
        .innerJoin(users, eq(users.id, applications.seekerId))
        .leftJoin(seekerProfiles, eq(seekerProfiles.userId, applications.seekerId))
        .where(and(eq(applications.jobId, jobId), isNull(users.suspendedAt)))
        .orderBy(desc(applications.createdAt));
      const fresh = rows.filter((r) => r.application.status === "submitted");
      if (options.markViewed && fresh.length > 0) {
        await db.transaction(async (tx) => {
          await tx
            .update(applications)
            .set({ status: "viewed" })
            .where(
              and(
                eq(applications.jobId, jobId),
                eq(applications.status, "submitted"),
                inArray(
                  applications.id,
                  fresh.map((r) => r.application.id),
                ),
              ),
            );
          await recordAudit(tx, options.actor, {
            action: "applications.viewed",
            targetType: "job",
            targetId: jobId,
            after: { count: fresh.length },
          });
        });
      }
      const checks = await summariesFor(
        db,
        rows.map((r) => r.application.seekerId),
      );
      return {
        job,
        applicants: rows.map((r) => {
          const isNew = r.application.status === "submitted";
          return {
            application: {
              ...r.application,
              status: isNew && options.markViewed ? "viewed" : r.application.status,
            },
            isNew,
            user: { id: r.application.seekerId, email: r.email, phoneNumber: r.phoneNumber },
            profile: r.profile,
            checks: checks.get(r.application.seekerId) as CheckSummary,
          };
        }),
      };
    },

    /** One application to this salon's jobs, from someone who isn't banned. */
    async application(applicationId: string): Promise<Application> {
      const [row] = await db
        .select({ application: applications })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(users, eq(users.id, applications.seekerId))
        .where(
          and(
            eq(applications.id, applicationId),
            eq(jobs.salonId, salonId),
            isNull(users.suspendedAt),
          ),
        );
      if (!row) throw notFoundApplication();
      return row.application;
    },

    /** Moves an application along. Returns what the caller needs to tell the person. */
    async setApplicationStatus(
      applicationId: string,
      status: ApplicationStatus,
      actor: Actor,
    ): Promise<{
      application: Application;
      before: ApplicationStatus;
      job: Job;
      contact: Contact;
    }> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select({
            application: applications,
            job: jobs,
            email: users.email,
            phoneNumber: users.phoneNumber,
          })
          .from(applications)
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .innerJoin(users, eq(users.id, applications.seekerId))
          .where(
            and(
              eq(applications.id, applicationId),
              eq(jobs.salonId, salonId),
              isNull(users.suspendedAt),
            ),
          )
          .for("update", { of: applications });
        if (!row) throw notFoundApplication();
        const [updated] = await tx
          .update(applications)
          .set({ status })
          .where(eq(applications.id, applicationId))
          .returning();
        if (row.application.status !== status) {
          await recordAudit(tx, actor, {
            action: "application.status_changed",
            targetType: "application",
            targetId: applicationId,
            before: { status: row.application.status },
            after: { status },
          });
        }
        return {
          application: updated as Application,
          before: row.application.status,
          job: row.job,
          contact: { email: row.email, phoneNumber: row.phoneNumber },
        };
      });
    },

    /** A person's full profile, only if they applied to one of this salon's jobs (and aren't banned). */
    async candidate(userId: string): Promise<Candidate | null> {
      const applied = await db
        .select({ application: applications, jobTitle: jobs.title })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(users, eq(users.id, applications.seekerId))
        .where(
          and(
            eq(applications.seekerId, userId),
            eq(jobs.salonId, salonId),
            isNull(users.suspendedAt),
          ),
        )
        .orderBy(desc(applications.createdAt));
      if (applied.length === 0) return null;
      const [profile, [user]] = await Promise.all([
        fullProfileOf(db, userId),
        db
          .select({ email: users.email, phoneNumber: users.phoneNumber })
          .from(users)
          .where(eq(users.id, userId)),
      ]);
      if (!profile || !user) return null;
      return {
        ...profile,
        contact: user,
        applications: applied.map((r) => ({ ...r.application, jobTitle: r.jobTitle })),
      };
    },

    /**
     * Who to tell about a new application for one of the salon's jobs: the people the job names, or
     * everyone on the team; only those still on it, and not banned.
     */
    async applicationContacts(job: Pick<Job, "notifyUserIds">): Promise<Contact[]> {
      const chosen = job.notifyUserIds;
      if (chosen && chosen.length === 0) return [];
      return db
        .select({ email: users.email, phoneNumber: users.phoneNumber })
        .from(salonMembers)
        .innerJoin(users, eq(users.id, salonMembers.userId))
        .where(
          and(
            eq(salonMembers.salonId, salonId),
            isNull(users.suspendedAt),
            chosen ? inArray(salonMembers.userId, chosen) : undefined,
          ),
        );
    },

    // ---------- Billing ----------

    async payments(limit = 20): Promise<Payment[]> {
      return db
        .select()
        .from(payments)
        .where(eq(payments.salonId, salonId))
        .orderBy(desc(payments.createdAt))
        .limit(limit);
    },

    async setStripeCustomer(customerId: string, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.update(salons).set({ stripeCustomerId: customerId }).where(eq(salons.id, salonId));
        await recordAudit(tx, actor, {
          action: "salon.stripe_customer_set",
          targetType: "salon",
          targetId: salonId,
        });
      });
    },

    /** A purchase waiting for checkout. `checkoutRef` can be set later, once Stripe has given one. */
    async startPayment(
      input: {
        kind: PaymentKind;
        amountCents: number;
        provider: "stripe" | "mock";
        checkoutRef?: string;
      },
      actor: Actor,
    ): Promise<Payment> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(payments)
          .values({ salonId, ...input, checkoutRef: input.checkoutRef ?? null })
          .returning();
        const payment = row as Payment;
        await recordAudit(tx, actor, {
          action: "payment.started",
          targetType: "payment",
          targetId: payment.id,
          after: { kind: input.kind, amountCents: input.amountCents, provider: input.provider },
        });
        return payment;
      });
    },

    async setCheckoutRef(paymentId: string, checkoutRef: string): Promise<void> {
      await db
        .update(payments)
        .set({ checkoutRef })
        .where(and(eq(payments.id, paymentId), eq(payments.salonId, salonId)));
    },
  };
}

/** Jobs with how many (not banned) people applied, and how many of those are new. */
async function jobsWithCounts(db: Executor, where: SQL): Promise<SalonJob[]> {
  const rows = await db
    .select({
      job: jobs,
      // Written out in full: Drizzle leaves the table off a column in a one-table query.
      applicants: sql<number>`(select count(*)::int from applications a join users u on u.id = a.seeker_id where a.job_id = "jobs"."id" and u.suspended_at is null)`,
      newApplicants: sql<number>`(select count(*)::int from applications a join users u on u.id = a.seeker_id where a.job_id = "jobs"."id" and a.status = 'submitted' and u.suspended_at is null)`,
    })
    .from(jobs)
    .where(where)
    .orderBy(desc(jobs.createdAt));
  return rows.map((r) => ({ ...r.job, applicants: r.applicants, newApplicants: r.newApplicants }));
}

/** Gives a job the slug its title, salon and place call for, redirecting its old public address. */
async function moveJob(
  tx: Executor,
  job: Job,
  wanted: { state: AuState; suburb: string; base: string },
): Promise<void> {
  const place = await placeSlug(tx, "job", wanted, job);
  if (samePlace(place, job)) return;
  // Only an ad that was published has an address anyone could have linked to.
  if (job.publishedAt) await writeRedirect(tx, "job", job, job.id);
  await tx.update(jobs).set(place).where(eq(jobs.id, job.id));
}

export type SalonScope = ReturnType<typeof salonScope>;
