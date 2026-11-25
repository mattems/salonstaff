/**
 * One signed-in person's own data: their account, job seeker profile and its sections, checks,
 * applications and saved jobs. Everything here is scoped to `userId`.
 */
import {
  ApiError,
  type ApplyInput,
  type EducationInput,
  type ExperienceInput,
  PROFILE_LIMITS,
  type ProfileDetailsInput,
  type SeekerProfileInput,
} from "@salonstaff/shared";
import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import { type CheckSummary, summarise } from "./checks";
import type { Db } from "./index";
import { type MySalon, salonsFor } from "./salon";
import {
  applications,
  jobs,
  portfolioItems,
  salons,
  savedJobs,
  seekerChecks,
  seekerEducation,
  seekerExperience,
  seekerProfiles,
  users,
} from "./schema";
import { releaseSalonsOf } from "./team";
import { type JobWithSalon, publicJob } from "./visibility";

export type User = typeof users.$inferSelect;
export type SeekerProfile = typeof seekerProfiles.$inferSelect;
export type Experience = typeof seekerExperience.$inferSelect;
export type Education = typeof seekerEducation.$inferSelect;
export type PortfolioItem = typeof portfolioItems.$inferSelect;
export type Application = typeof applications.$inferSelect;

export interface FullProfile {
  profile: SeekerProfile;
  experience: Experience[];
  education: Education[];
  portfolio: PortfolioItem[];
  checks: CheckSummary;
}

/** A person's whole profile, as they and the salons they applied to see it. */
export async function fullProfileOf(db: Executor, userId: string): Promise<FullProfile | null> {
  const [profile] = await db.select().from(seekerProfiles).where(eq(seekerProfiles.userId, userId));
  if (!profile) return null;
  const [experience, education, portfolio, checkRows] = await Promise.all([
    db.select().from(seekerExperience).where(eq(seekerExperience.userId, userId)),
    db
      .select()
      .from(seekerEducation)
      .where(eq(seekerEducation.userId, userId))
      .orderBy(sql`${seekerEducation.year} desc nulls last`, desc(seekerEducation.createdAt)),
    db
      .select()
      .from(portfolioItems)
      .where(eq(portfolioItems.userId, userId))
      .orderBy(asc(portfolioItems.sortOrder), asc(portfolioItems.createdAt)),
    db.select().from(seekerChecks).where(eq(seekerChecks.userId, userId)),
  ]);
  // Current roles (no end month) first, then the most recent.
  experience.sort(
    (a, b) =>
      (a.endMonth ? 1 : 0) - (b.endMonth ? 1 : 0) ||
      b.startMonth.localeCompare(a.startMonth) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return { profile, experience, education, portfolio, checks: summarise(checkRows) };
}

const noProfile = () =>
  new ApiError("conflict", {
    detail: "Save your basic details first",
    hint: "Send your name, location and roles with PUT /v1/me/profile, then add the rest.",
  });

/** The profile columns the basics form sets. */
export const profileValues = (input: SeekerProfileInput) => ({
  firstName: input.firstName,
  lastName: input.lastName,
  phone: input.phone ?? null,
  headline: input.headline ?? null,
  about: input.about ?? null,
  suburb: input.suburb,
  state: input.state,
  postcode: input.postcode,
  roles: input.roles,
  yearsExperience: input.yearsExperience,
  qualifications: input.qualifications ?? null,
  instagram: input.instagram?.replace(/^@+/, "") || null,
  rightToWork: input.rightToWork,
  openToWork: input.openToWork,
});

const dedupe = (tags: string[]) => [...new Map(tags.map((t) => [t.toLowerCase(), t])).values()];

export interface Account {
  user: User;
  profile: SeekerProfile | null;
  checks: CheckSummary;
  /** The salons they're on the team of (D-11), in the order they joined. */
  salons: MySalon[];
}

export interface MyApplication extends JobWithSalon {
  application: Application;
}

export function seeker(db: Db, userId: string) {
  const profileRow = async (tx: Executor = db) => {
    const [row] = await tx.select().from(seekerProfiles).where(eq(seekerProfiles.userId, userId));
    return row ?? null;
  };
  const requireProfile = async (tx: Executor) => {
    const row = await profileRow(tx);
    if (!row) throw noProfile();
    return row;
  };

  return {
    async account(): Promise<Account | null> {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return null;
      const [profile, checkRows, mySalons] = await Promise.all([
        profileRow(),
        db.select().from(seekerChecks).where(eq(seekerChecks.userId, userId)),
        salonsFor(db).ofUser(userId),
      ]);
      return { user, profile, checks: summarise(checkRows), salons: mySalons };
    },

    profile: () => profileRow(),
    fullProfile: () => fullProfileOf(db, userId),

    /** Creates or replaces the basics. The account's name follows the profile's. */
    async saveProfile(input: SeekerProfileInput, actor: Actor): Promise<SeekerProfile> {
      const values = profileValues(input);
      return db.transaction(async (tx) => {
        const before = await profileRow(tx);
        const [row] = await tx
          .insert(seekerProfiles)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: seekerProfiles.userId, set: values })
          .returning();
        await tx
          .update(users)
          .set({ name: `${input.firstName} ${input.lastName}` })
          .where(eq(users.id, userId));
        await recordAudit(tx, actor, {
          action: before ? "profile.updated" : "profile.created",
          targetType: "user",
          targetId: userId,
        });
        return row as SeekerProfile;
      });
    },

    async saveDetails(input: ProfileDetailsInput, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        await requireProfile(tx);
        await tx
          .update(seekerProfiles)
          .set({
            specialties: dedupe(input.specialties),
            brands: dedupe(input.brands),
            availableDays: [...new Set(input.availableDays)],
            employmentTypes: [...new Set(input.employmentTypes)],
            availableFrom: input.availableFrom ?? null,
            travelKm: input.travelKm ?? null,
            payExpectation: input.payExpectation ?? null,
          })
          .where(eq(seekerProfiles.userId, userId));
        await recordAudit(tx, actor, {
          action: "profile.details_updated",
          targetType: "user",
          targetId: userId,
        });
      });
    },

    /** Fails unless there is a profile to attach pictures and sections to. */
    async requireProfile(): Promise<SeekerProfile> {
      return requireProfile(db);
    },

    /** Sets the photo; returns the old picture's key for the caller to delete. */
    async setPhoto(key: string | null, actor: Actor): Promise<{ previousKey: string | null }> {
      return db.transaction(async (tx) => {
        const row = await requireProfile(tx);
        await tx
          .update(seekerProfiles)
          .set({ photoKey: key })
          .where(eq(seekerProfiles.userId, userId));
        await recordAudit(tx, actor, {
          action: key ? "profile.photo_set" : "profile.photo_removed",
          targetType: "user",
          targetId: userId,
        });
        return { previousKey: row.photoKey };
      });
    },

    async portfolioCount(): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(portfolioItems)
        .where(eq(portfolioItems.userId, userId));
      return row?.n ?? 0;
    },

    async addPortfolioItem(
      input: { imageKey: string; caption?: string | undefined },
      actor: Actor,
    ): Promise<PortfolioItem> {
      return db.transaction(async (tx) => {
        await requireProfile(tx);
        // Locks the profile so two uploads at once can't both take the last place.
        await tx
          .select()
          .from(seekerProfiles)
          .where(eq(seekerProfiles.userId, userId))
          .for("update");
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(portfolioItems)
          .where(eq(portfolioItems.userId, userId));
        if (n >= PROFILE_LIMITS.portfolio) {
          throw new ApiError("conflict", {
            detail: `You can add up to ${PROFILE_LIMITS.portfolio} portfolio photos`,
            hint: "Remove a photo (DELETE /v1/me/portfolio/{id}) before adding another.",
          });
        }
        const [row] = await tx
          .insert(portfolioItems)
          .values({
            userId,
            imageKey: input.imageKey,
            caption: input.caption?.trim() || null,
            sortOrder: n,
          })
          .returning();
        const item = row as PortfolioItem;
        await recordAudit(tx, actor, {
          action: "profile.portfolio_added",
          targetType: "portfolio_item",
          targetId: item.id,
        });
        return item;
      });
    },

    /** Removes one of their portfolio pictures; returns its key, or null if it isn't theirs. */
    async removePortfolioItem(id: string, actor: Actor): Promise<string | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .delete(portfolioItems)
          .where(and(eq(portfolioItems.id, id), eq(portfolioItems.userId, userId)))
          .returning();
        if (!row) return null;
        await recordAudit(tx, actor, {
          action: "profile.portfolio_removed",
          targetType: "portfolio_item",
          targetId: id,
        });
        return row.imageKey;
      });
    },

    async addExperience(input: ExperienceInput, actor: Actor): Promise<Experience> {
      return db.transaction(async (tx) => {
        await requireProfile(tx);
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(seekerExperience)
          .where(eq(seekerExperience.userId, userId));
        if (n >= PROFILE_LIMITS.experience) {
          throw new ApiError("conflict", {
            detail: `You can list up to ${PROFILE_LIMITS.experience} roles`,
            hint: "Remove an older role before adding another.",
          });
        }
        const [row] = await tx
          .insert(seekerExperience)
          .values({
            userId,
            salonName: input.salonName,
            title: input.title,
            location: input.location ?? null,
            startMonth: input.startMonth,
            endMonth: input.endMonth ?? null,
            description: input.description ?? null,
          })
          .returning();
        const item = row as Experience;
        await recordAudit(tx, actor, {
          action: "profile.experience_added",
          targetType: "experience",
          targetId: item.id,
        });
        return item;
      });
    },

    async removeExperience(id: string, actor: Actor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .delete(seekerExperience)
          .where(and(eq(seekerExperience.id, id), eq(seekerExperience.userId, userId)))
          .returning({ id: seekerExperience.id });
        if (row) {
          await recordAudit(tx, actor, {
            action: "profile.experience_removed",
            targetType: "experience",
            targetId: id,
          });
        }
        return Boolean(row);
      });
    },

    async addEducation(input: EducationInput, actor: Actor): Promise<Education> {
      return db.transaction(async (tx) => {
        await requireProfile(tx);
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(seekerEducation)
          .where(eq(seekerEducation.userId, userId));
        if (n >= PROFILE_LIMITS.education) {
          throw new ApiError("conflict", {
            detail: `You can list up to ${PROFILE_LIMITS.education} qualifications`,
            hint: "Remove one before adding another.",
          });
        }
        const [row] = await tx
          .insert(seekerEducation)
          .values({
            userId,
            qualification: input.qualification,
            institution: input.institution,
            year: input.year ?? null,
          })
          .returning();
        const item = row as Education;
        await recordAudit(tx, actor, {
          action: "profile.education_added",
          targetType: "education",
          targetId: item.id,
        });
        return item;
      });
    },

    async removeEducation(id: string, actor: Actor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .delete(seekerEducation)
          .where(and(eq(seekerEducation.id, id), eq(seekerEducation.userId, userId)))
          .returning({ id: seekerEducation.id });
        if (row) {
          await recordAudit(tx, actor, {
            action: "profile.education_removed",
            targetType: "education",
            targetId: id,
          });
        }
        return Boolean(row);
      });
    },

    // ---------- Applications and saved jobs ----------

    async applications(): Promise<MyApplication[]> {
      const rows = await db
        .select({ application: applications, job: jobs, salon: salons })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(eq(applications.seekerId, userId))
        .orderBy(desc(applications.createdAt));
      return rows;
    },

    /** Saved jobs that still have a public page (closed ones included, marked by the caller). */
    async saved(): Promise<JobWithSalon[]> {
      return db
        .select({ job: jobs, salon: salons })
        .from(savedJobs)
        .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
        .innerJoin(salons, eq(salons.id, jobs.salonId))
        .where(and(eq(savedJobs.userId, userId), publicJob()))
        .orderBy(desc(savedJobs.createdAt));
    },

    async viewerState(jobId: string): Promise<{ applied: boolean; saved: boolean }> {
      const [applied, saved] = await Promise.all([
        db
          .select({ id: applications.id })
          .from(applications)
          .where(and(eq(applications.jobId, jobId), eq(applications.seekerId, userId))),
        db
          .select({ id: savedJobs.jobId })
          .from(savedJobs)
          .where(and(eq(savedJobs.jobId, jobId), eq(savedJobs.userId, userId))),
      ]);
      return { applied: applied.length > 0, saved: saved.length > 0 };
    },

    async save(jobId: string, saved: boolean, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        const changed = saved
          ? await tx.insert(savedJobs).values({ userId, jobId }).onConflictDoNothing().returning()
          : await tx
              .delete(savedJobs)
              .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
              .returning();
        if (changed.length > 0) {
          await recordAudit(tx, actor, {
            action: saved ? "job.saved" : "job.unsaved",
            targetType: "job",
            targetId: jobId,
          });
        }
      });
    },

    /** Applications sent in the last 24 hours, for the daily limit. */
    async applicationsToday(): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(applications)
        .where(
          and(
            eq(applications.seekerId, userId),
            gt(applications.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          ),
        );
      return row?.n ?? 0;
    },

    /**
     * Records an application. Eligibility is the caller's job (`eligibilityOf`); this only refuses
     * a second application to the same job, even when two arrive at once.
     */
    async apply(jobId: string, input: ApplyInput, actor: Actor): Promise<Application> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(applications)
          .values({ jobId, seekerId: userId, coverNote: input.coverNote ?? null })
          .onConflictDoNothing()
          .returning();
        if (!row) {
          throw new ApiError("conflict", {
            detail: "You've already applied for this job",
            hint: "See where it's up to with GET /v1/me/applications.",
          });
        }
        await recordAudit(tx, actor, {
          action: "application.submitted",
          targetType: "application",
          targetId: row.id,
          after: { jobId },
        });
        return row;
      });
    },

    // ---------- Deleting the account ----------

    /**
     * Permanently deletes the person and everything attached to them. They leave every salon's team;
     * where they were the last owner, a directory listing they claimed goes back to being unclaimed
     * and a salon they created is deleted with its jobs.
     * Returns the stored files the caller must delete.
     */
    async deleteAccount(actor: Actor): Promise<{ mediaKeys: string[]; privateKeys: string[] }> {
      return db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!user) return { mediaKeys: [], privateKeys: [] };
        const [profile, portfolio, checkRows] = await Promise.all([
          profileRow(tx),
          tx.select().from(portfolioItems).where(eq(portfolioItems.userId, userId)),
          tx.select().from(seekerChecks).where(eq(seekerChecks.userId, userId)),
        ]);
        const { deleted: created } = await releaseSalonsOf(
          tx,
          userId,
          actor,
          "The owner deleted their account",
        );
        await tx.delete(users).where(eq(users.id, userId));
        await recordAudit(tx, actor, {
          action: "user.deleted",
          targetType: "user",
          targetId: userId,
          reason: "Deleted their own account",
        });
        const mediaKeys = [
          profile?.photoKey,
          ...portfolio.map((p) => p.imageKey),
          ...created.map((s) => s.logoKey),
        ].filter((key): key is string => Boolean(key));
        const privateKeys = checkRows
          .map((c) => c.documentKey)
          .filter((key): key is string => Boolean(key));
        return { mediaKeys, privateKeys };
      });
    },
  };
}

export type SeekerScope = ReturnType<typeof seeker>;
