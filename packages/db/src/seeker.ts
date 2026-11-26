/**
 * One signed-in person's own data: their account, job seeker profile and its sections, checks,
 * applications and saved jobs. Everything here is scoped to `userId`.
 */
import {
  ApiError,
  type ApplyInput,
  CONTACT_LIMITS,
  type EducationInput,
  type EndorsementRequestInput,
  type ExperienceInput,
  PROFILE_LIMITS,
  type ProfileDetailsInput,
  type ProfileSettingsInput,
  type SeekerProfileInput,
  shareCode,
} from "@salonstaff/shared";
import { and, asc, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Actor, type Executor, recordAudit } from "./audit";
import { type CheckSummary, type EducationCheck, educationChecks, summarise } from "./checks";
import type { Db } from "./index";
import { type MySalon, salonsFor } from "./salon";
import {
  applications,
  jobs,
  portfolioItems,
  profileContacts,
  salons,
  savedJobs,
  seekerChecks,
  seekerEducation,
  seekerEndorsements,
  seekerExperience,
  seekerHiddenSalons,
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
export type Endorsement = typeof seekerEndorsements.$inferSelect;
export type ProfileContact = typeof profileContacts.$inferSelect;
type Salon = typeof salons.$inferSelect;

export interface FullProfile {
  profile: SeekerProfile;
  experience: Experience[];
  /** With each entry's qualification check, if one was sent. */
  education: (Education & { check: EducationCheck | null })[];
  portfolio: PortfolioItem[];
  checks: CheckSummary;
  /** Shown endorsements only, newest first, with the referee's salon on Salon Staff if any. */
  endorsements: ShownEndorsement[];
}

export interface ShownEndorsement {
  endorsement: Endorsement;
  refereeSalon: Pick<Salon, "name" | "state" | "suburbSlug" | "slug"> | null;
}

/** A salon that contacted the job seeker, for their own list (D-13). */
export interface ContactRecord {
  contact: ProfileContact;
  salon: Salon;
  /** Who on the salon's team, if their account still exists. */
  sender: { name: string; email: string } | null;
  /** They've hidden their profile from this salon. */
  hidden: boolean;
}

/** Shown endorsements for a profile, newest first. */
export async function shownEndorsementsOf(
  db: Executor,
  userId: string,
): Promise<ShownEndorsement[]> {
  return db
    .select({
      endorsement: seekerEndorsements,
      refereeSalon: {
        name: salons.name,
        state: salons.state,
        suburbSlug: salons.suburbSlug,
        slug: salons.slug,
      },
    })
    .from(seekerEndorsements)
    .leftJoin(salons, eq(salons.id, seekerEndorsements.refereeSalonId))
    .where(and(eq(seekerEndorsements.userId, userId), eq(seekerEndorsements.status, "shown")))
    .orderBy(desc(seekerEndorsements.writtenAt));
}

/** A person's whole profile, as they and the salons they applied to see it. */
export async function fullProfileOf(db: Executor, userId: string): Promise<FullProfile | null> {
  const [profile] = await db.select().from(seekerProfiles).where(eq(seekerProfiles.userId, userId));
  if (!profile) return null;
  const [experience, education, portfolio, checkRows, endorsements] = await Promise.all([
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
    shownEndorsementsOf(db, userId),
  ]);
  // Current roles (no end month) first, then the most recent.
  experience.sort(
    (a, b) =>
      (a.endMonth ? 1 : 0) - (b.endMonth ? 1 : 0) ||
      b.startMonth.localeCompare(a.startMonth) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const checkOf = educationChecks(checkRows);
  return {
    profile,
    experience,
    education: education.map((e) => ({ ...e, check: checkOf.get(e.id) ?? null })),
    portfolio,
    checks: summarise(checkRows),
    endorsements,
  };
}

const noProfile = () =>
  new ApiError("conflict", {
    detail: "Save your basic details first",
    hint: "Send your name, location and roles with PUT /v1/me/profile, then add the rest.",
  });

/** "@jess", "https://www.tiktok.com/@jess/" → "jess". */
const handle = (value: string | undefined) =>
  value
    ?.replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "") || null;

/** The profile columns the basics form sets. */
export const profileValues = (input: SeekerProfileInput) => ({
  firstName: input.firstName,
  lastName: input.lastName,
  headline: input.headline ?? null,
  about: input.about ?? null,
  suburb: input.suburb,
  state: input.state,
  postcode: input.postcode,
  roles: input.roles,
  yearsExperience: input.yearsExperience,
  instagram: handle(input.instagram),
  tiktok: handle(input.tiktok),
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
  /** Salons' messages and number views they haven't seen in their inbox (D-13). */
  unreadContacts: number;
}

const sender = alias(users, "sender");

export interface MyApplication extends JobWithSalon {
  application: Application;
}

export function seeker(db: Db, userId: string) {
  const profileRow = async (tx: Executor = db) => {
    const [row] = await tx.select().from(seekerProfiles).where(eq(seekerProfiles.userId, userId));
    return row ?? null;
  };
  const unread = async () => {
    const [row] = await db
      .select({ n: count() })
      .from(profileContacts)
      .where(and(eq(profileContacts.seekerId, userId), isNull(profileContacts.readAt)));
    return row?.n ?? 0;
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
      const [profile, checkRows, mySalons, unreadContacts] = await Promise.all([
        profileRow(),
        db.select().from(seekerChecks).where(eq(seekerChecks.userId, userId)),
        salonsFor(db).ofUser(userId),
        unread(),
      ]);
      return { user, profile, checks: summarise(checkRows), salons: mySalons, unreadContacts };
    },

    profile: () => profileRow(),
    fullProfile: () => fullProfileOf(db, userId),

    /**
     * Changes the account's name: what a salon's team and invite emails show. A job seeker's name
     * follows their profile instead, so they change it there.
     */
    async rename(name: string, actor: Actor): Promise<User> {
      return db.transaction(async (tx) => {
        const [before] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!before) throw new ApiError("unauthenticated", { hint: "Sign in again." });
        if (await profileRow(tx)) {
          throw new ApiError("conflict", {
            detail: "Your name comes from your job seeker profile",
            hint: "Change your first and last name with PUT /v1/me/profile.",
          });
        }
        if (before.name === name) return before;
        const [row] = await tx.update(users).set({ name }).where(eq(users.id, userId)).returning();
        await recordAudit(tx, actor, {
          action: "user.renamed",
          targetType: "user",
          targetId: userId,
          before: { name: before.name },
          after: { name },
        });
        return row as User;
      });
    },

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
            payMin: input.payMin ?? null,
            payPeriod: input.payPeriod,
          })
          .where(eq(seekerProfiles.userId, userId));
        await recordAudit(tx, actor, {
          action: "profile.details_updated",
          targetType: "user",
          targetId: userId,
        });
      });
    },

    /**
     * Who sees the profile and how salons may contact them (D-13). Going public makes a share
     * code the first time.
     */
    async saveSettings(input: ProfileSettingsInput, actor: Actor): Promise<SeekerProfile> {
      return db.transaction(async (tx) => {
        const before = await requireProfile(tx);
        const after = {
          visibility: input.visibility ?? before.visibility,
          contactBy: input.contactBy ?? before.contactBy,
          shareCode:
            (input.visibility ?? before.visibility) === "public" && !before.shareCode
              ? shareCode()
              : before.shareCode,
        };
        const [row] = await tx
          .update(seekerProfiles)
          .set(after)
          .where(eq(seekerProfiles.userId, userId))
          .returning();
        if (after.visibility !== before.visibility || after.contactBy !== before.contactBy) {
          await recordAudit(tx, actor, {
            action: "profile.settings_changed",
            targetType: "user",
            targetId: userId,
            before: { visibility: before.visibility, contactBy: before.contactBy },
            after: { visibility: after.visibility, contactBy: after.contactBy },
          });
        }
        return row as SeekerProfile;
      });
    },

    /** A new share code: the old link stops working. */
    async renewShareCode(actor: Actor): Promise<SeekerProfile> {
      return db.transaction(async (tx) => {
        await requireProfile(tx);
        const [row] = await tx
          .update(seekerProfiles)
          .set({ shareCode: shareCode() })
          .where(eq(seekerProfiles.userId, userId))
          .returning();
        await recordAudit(tx, actor, {
          action: "profile.share_link_renewed",
          targetType: "user",
          targetId: userId,
        });
        return row as SeekerProfile;
      });
    },

    // ---------- Hidden salons and who contacted them (D-13) ----------

    async hiddenSalons(): Promise<Salon[]> {
      const rows = await db
        .select({ salon: salons })
        .from(seekerHiddenSalons)
        .innerJoin(salons, eq(salons.id, seekerHiddenSalons.salonId))
        .where(eq(seekerHiddenSalons.userId, userId))
        .orderBy(asc(salons.name));
      return rows.map((r) => r.salon);
    },

    /** Hides the profile from a salon, or shows it again. False if there's no such salon. */
    async hideFrom(salonId: string, hidden: boolean, actor: Actor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [salon] = await tx
          .select({ id: salons.id })
          .from(salons)
          .where(eq(salons.id, salonId));
        if (!salon) return false;
        const changed = hidden
          ? await tx
              .insert(seekerHiddenSalons)
              .values({ userId, salonId })
              .onConflictDoNothing()
              .returning()
          : await tx
              .delete(seekerHiddenSalons)
              .where(
                and(eq(seekerHiddenSalons.userId, userId), eq(seekerHiddenSalons.salonId, salonId)),
              )
              .returning();
        if (changed.length > 0) {
          await recordAudit(tx, actor, {
            action: hidden ? "profile.hidden_from_salon" : "profile.shown_to_salon",
            targetType: "salon",
            targetId: salonId,
          });
        }
        return true;
      });
    },

    /** Messages and number reveals from salons, newest first (the last 200). */
    async contacts(): Promise<ContactRecord[]> {
      const rows = await db
        .select({
          contact: profileContacts,
          salon: salons,
          hiddenSalon: seekerHiddenSalons.salonId,
          senderName: sender.name,
          senderEmail: sender.email,
        })
        .from(profileContacts)
        .innerJoin(salons, eq(salons.id, profileContacts.salonId))
        .leftJoin(sender, eq(sender.id, profileContacts.senderId))
        .leftJoin(
          seekerHiddenSalons,
          and(
            eq(seekerHiddenSalons.userId, userId),
            eq(seekerHiddenSalons.salonId, profileContacts.salonId),
          ),
        )
        .where(eq(profileContacts.seekerId, userId))
        .orderBy(desc(profileContacts.createdAt))
        .limit(200);
      return rows.map((r) => ({
        contact: r.contact,
        salon: r.salon,
        sender:
          r.senderName !== null && r.senderEmail !== null
            ? { name: r.senderName, email: r.senderEmail }
            : null,
        hidden: r.hiddenSalon !== null,
      }));
    },

    unreadContacts: unread,

    /** Marks messages and number views as seen: those given, or all. Returns how many changed. */
    async markContactsRead(ids: string[] | null, actor: Actor): Promise<number> {
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(profileContacts)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(profileContacts.seekerId, userId),
              isNull(profileContacts.readAt),
              ids ? inArray(profileContacts.id, ids) : undefined,
            ),
          )
          .returning({ id: profileContacts.id });
        if (rows.length > 0) {
          await recordAudit(tx, actor, {
            action: "profile.contacts_read",
            targetType: "user",
            targetId: userId,
            after: { count: rows.length },
          });
        }
        return rows.length;
      });
    },

    // ---------- Endorsements (D-13) ----------

    async endorsements(): Promise<Endorsement[]> {
      return db
        .select()
        .from(seekerEndorsements)
        .where(eq(seekerEndorsements.userId, userId))
        .orderBy(desc(seekerEndorsements.createdAt));
    },

    /**
     * Records a request; the caller emails the link whose token hashes to `tokenHash`. Refused
     * for their own address, an address already asked, and past the limits.
     */
    async requestEndorsement(
      input: EndorsementRequestInput,
      tokenHash: string,
      actor: Actor,
    ): Promise<{ endorsement: Endorsement; profile: SeekerProfile }> {
      return db.transaction(async (tx) => {
        const profile = await requireProfile(tx);
        // Locks the profile so two requests at once can't both pass the limits.
        await tx
          .select()
          .from(seekerProfiles)
          .where(eq(seekerProfiles.userId, userId))
          .for("update");
        const [me] = await tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId));
        const email = input.refereeEmail.toLowerCase();
        if (me?.email.toLowerCase() === email) {
          throw new ApiError("validation_failed", {
            detail: "You can't endorse yourself",
            hint: "Ask someone you've worked with, at their own address.",
            errors: [{ path: "refereeEmail", message: "That's your own email" }],
          });
        }
        const existing = await tx
          .select()
          .from(seekerEndorsements)
          .where(eq(seekerEndorsements.userId, userId));
        if (existing.some((e) => e.refereeEmail === email)) {
          throw new ApiError("conflict", {
            detail: "You've already asked that person",
            hint: "Each person can endorse you once. Remove the earlier one to ask again.",
            errors: [{ path: "refereeEmail", message: "You've already asked this person" }],
          });
        }
        const waiting = existing.filter((e) => e.status === "requested").length;
        if (waiting >= PROFILE_LIMITS.endorsementRequests) {
          throw new ApiError("conflict", {
            detail: `You have ${waiting} requests waiting for an answer`,
            hint: "Remove one you don't expect back before asking someone else.",
          });
        }
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (
          existing.filter((e) => e.createdAt > dayAgo).length >=
          CONTACT_LIMITS.endorsementRequestsPerDay
        ) {
          throw new ApiError("rate_limited", {
            detail: `You can ask ${CONTACT_LIMITS.endorsementRequestsPerDay} people a day`,
            hint: "Try again tomorrow.",
          });
        }
        const [row] = await tx
          .insert(seekerEndorsements)
          .values({
            userId,
            refereeEmail: email,
            refereeName: input.refereeName,
            note: input.note ?? null,
            tokenHash,
            tokenExpiresAt: new Date(
              Date.now() + CONTACT_LIMITS.endorsementLinkDays * 24 * 60 * 60 * 1000,
            ),
          })
          .returning();
        const endorsement = row as Endorsement;
        await recordAudit(tx, actor, {
          action: "endorsement.requested",
          targetType: "endorsement",
          targetId: endorsement.id,
        });
        return { endorsement, profile };
      });
    },

    /** Shows or hides a written endorsement. Null if it isn't theirs or isn't written yet. */
    async showEndorsement(id: string, shown: boolean, actor: Actor): Promise<Endorsement | null> {
      return db.transaction(async (tx) => {
        await tx
          .select()
          .from(seekerProfiles)
          .where(eq(seekerProfiles.userId, userId))
          .for("update");
        const [row] = await tx
          .select()
          .from(seekerEndorsements)
          .where(and(eq(seekerEndorsements.id, id), eq(seekerEndorsements.userId, userId)));
        if (!row || row.status === "requested") return null;
        const status = shown ? "shown" : "hidden";
        if (row.status === status) return row;
        if (shown) {
          const [{ n } = { n: 0 }] = await tx
            .select({ n: count() })
            .from(seekerEndorsements)
            .where(
              and(eq(seekerEndorsements.userId, userId), eq(seekerEndorsements.status, "shown")),
            );
          if (n >= PROFILE_LIMITS.endorsements) {
            throw new ApiError("conflict", {
              detail: `You can show up to ${PROFILE_LIMITS.endorsements} endorsements`,
              hint: "Hide one before showing another.",
            });
          }
        }
        const [updated] = await tx
          .update(seekerEndorsements)
          .set({ status })
          .where(eq(seekerEndorsements.id, id))
          .returning();
        await recordAudit(tx, actor, {
          action: shown ? "endorsement.shown" : "endorsement.hidden",
          targetType: "endorsement",
          targetId: id,
        });
        return updated as Endorsement;
      });
    },

    /** Deletes one of their endorsements or requests (its link stops working). */
    async removeEndorsement(id: string, actor: Actor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .delete(seekerEndorsements)
          .where(and(eq(seekerEndorsements.id, id), eq(seekerEndorsements.userId, userId)))
          .returning({ id: seekerEndorsements.id });
        if (row) {
          await recordAudit(tx, actor, {
            action: "endorsement.removed",
            targetType: "endorsement",
            targetId: id,
          });
        }
        return Boolean(row);
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
            institution: input.institution ?? null,
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
