/**
 * Everything the admin portal may read and change. Only routes behind `requireStaff` (and the
 * staff script) use it. The admin's own data (staff, passkeys, audit log) is in staff-office.ts.
 * Every change writes its audit row in the same transaction.
 */
import {
  AU_STATE_VALUES,
  type AuState,
  isValidAbn,
  nextFreeSlug,
  PRICING,
  slugify,
  type VerificationStatus,
} from "@salonstaff/shared";
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import type { Db } from "./index";
import { contains } from "./like";
import {
  applications,
  jobs,
  payments,
  portfolioItems,
  type SalonStatus,
  salonClaims,
  salons,
  seekerChecks,
  seekerProfiles,
  sessions,
  type UserRole,
  userFlags,
  users,
} from "./schema";
import { staffOffice } from "./staff-office";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AdminUser = typeof users.$inferSelect;
export type AdminSalon = typeof salons.$inferSelect;
export type AdminJob = typeof jobs.$inferSelect;
export type AdminCheck = typeof seekerChecks.$inferSelect;
export type AdminClaim = typeof salonClaims.$inferSelect;
export type AdminFlag = typeof userFlags.$inferSelect;
export type AdminPayment = typeof payments.$inferSelect;

/** Files to delete from R2 once a change has committed. */
export interface FilesToDelete {
  /** Keys in the public MEDIA bucket. */
  media: string[];
  /** Keys in the PRIVATE bucket. */
  private: string[];
}

/** Statuses a job can be filtered on in the admin portal. */
export const ADMIN_JOB_FILTERS = ["live", "expired", "draft", "closed", "featured"] as const;
export type AdminJobFilter = (typeof ADMIN_JOB_FILTERS)[number];

/** Kinds of check staff review by hand. Identity is automatic (Stripe Identity). */
export const REVIEWED_CHECK_KINDS = ["right_to_work", "qualification"] as const;
/** A check still waiting for a decision. */
const OPEN_CHECK_STATUSES: VerificationStatus[] = ["pending", "requires_input"];

/** A directory import's header. `name`, `suburb`, `state` and `postcode` are required. */
export const DIRECTORY_CSV_COLUMNS = [
  "name",
  "suburb",
  "state",
  "postcode",
  "address",
  "phone",
  "email",
  "website",
  "instagram",
  "abn",
  "about",
] as const;
const REQUIRED_COLUMNS = ["name", "suburb", "state", "postcode"] as const;
export const DIRECTORY_IMPORT_MAX_ROWS = 5000;

/** The CSV can't be imported at all (as opposed to rows in it being skipped). */
export class DirectoryImportError extends Error {}
/** A salon with that ABN, or the same name and postcode, is already listed. */
export class DuplicateListingError extends Error {}

const live = () => and(eq(jobs.status, "published"), gt(jobs.expiresAt, sql`now()`));
const applicantCount = sql<number>`(select count(*)::int from ${applications} where ${applications.jobId} = ${jobs.id})`;
const openFlagCount = sql<number>`(select count(*)::int from ${userFlags} where ${userFlags.userId} = ${users.id} and ${userFlags.resolvedAt} is null)`;
const idVerified = sql<boolean>`exists (select 1 from ${seekerChecks} where ${seekerChecks.userId} = ${users.id} and ${seekerChecks.kind} = 'identity' and ${seekerChecks.status} = 'verified')`;
const liveJobCount = sql<number>`(select count(*)::int from ${jobs} where ${jobs.salonId} = ${salons.id} and ${jobs.status} = 'published' and ${jobs.expiresAt} > now())`;

/** `0412 345 678` and `+61 412 345 678` both find `+61412345678`. */
function phonePattern(q: string): string | null {
  const digits = q.replace(/[\s()-]/g, "");
  if (!/^\+?\d{4,}$/.test(digits)) return null;
  return contains(/^0\d{9}$/.test(digits) ? `+61${digits.slice(1)}` : digits);
}

// ---------------------------------------------------------------------------
// Directory listings
// ---------------------------------------------------------------------------

export interface ListingInput {
  name: string;
  suburb: string;
  state: AuState;
  postcode: string;
  address?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  website?: string | undefined;
  instagram?: string | undefined;
  abn?: string | undefined;
  about?: string | undefined;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Tidies and checks one listing. Returns what's wrong with it as a sentence, or the listing. */
export function cleanListing(raw: Record<string, string | undefined>): ListingInput | string {
  const v = (key: string) => raw[key]?.trim() || undefined;
  const name = v("name");
  const suburb = v("suburb");
  const state = v("state")?.toUpperCase();
  const postcode = v("postcode");
  if (!name) return "The name is missing";
  if (name.length > 200) return "The name is longer than 200 characters";
  if (!suburb) return "The suburb is missing";
  if (!state || !(AU_STATE_VALUES as readonly string[]).includes(state)) {
    return `"${raw.state ?? ""}" isn't a state (use NSW, VIC, QLD, WA, SA, TAS, ACT or NT)`;
  }
  if (!postcode || !/^\d{4}$/.test(postcode))
    return `"${raw.postcode ?? ""}" isn't a 4-digit postcode`;
  const abn = v("abn")?.replace(/\s+/g, "");
  if (abn && !isValidAbn(abn)) return `"${raw.abn}" isn't a valid ABN`;
  const email = v("email")?.toLowerCase();
  if (email && !EMAIL_RE.test(email)) return `"${email}" isn't an email address`;
  return {
    name,
    suburb,
    state: state as AuState,
    postcode,
    address: v("address"),
    phone: v("phone"),
    email,
    website: v("website"),
    instagram: v("instagram")?.replace(/^@/, ""),
    abn,
    about: v("about"),
  };
}

/** A small CSV reader: quoted fields, doubled quotes, and commas or line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  if (field || row.length) endRow();
  return rows.filter((r) => r.some((f) => f.trim()));
}

const dupeKey = (name: string, postcode: string) => `${name.trim().toLowerCase()}|${postcode}`;
const placeKey = (state: string, suburbSlug: string) => `${state}/${suburbSlug}`;

function listingRow(input: ListingInput, slug: string, suburbSlug: string) {
  return {
    name: input.name,
    slug,
    suburbSlug,
    suburb: input.suburb,
    state: input.state,
    postcode: input.postcode,
    address: input.address ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    instagram: input.instagram ?? null,
    abn: input.abn ?? null,
    about: input.about ?? null,
    // Not queued for staff: nobody owns the listing yet, and a claim checks the ABN (D-04, D-09).
    abnStatus: "not_started" as VerificationStatus,
    source: "directory" as const,
  };
}

/** The slugs already used in each suburb named, so new listings can take the next free one. */
async function takenSlugs(tx: Executor, places: string[]): Promise<Map<string, Set<string>>> {
  const taken = new Map<string, Set<string>>(places.map((p) => [p, new Set()]));
  if (places.length === 0) return taken;
  const rows = await tx
    .select({ state: salons.state, suburbSlug: salons.suburbSlug, slug: salons.slug })
    .from(salons)
    .where(inArray(sql<string>`${salons.state} || '/' || ${salons.suburbSlug}`, places));
  for (const row of rows) taken.get(placeKey(row.state, row.suburbSlug))?.add(row.slug);
  return taken;
}

/** Listings already there with one of these ABNs, or the same name and postcode. */
async function existingListings(tx: Executor, inputs: ListingInput[]) {
  const abns = [...new Set(inputs.flatMap((i) => (i.abn ? [i.abn] : [])))];
  const keys = [...new Set(inputs.map((i) => dupeKey(i.name, i.postcode)))];
  const found = { abns: new Set<string>(), keys: new Set<string>() };
  if (inputs.length === 0) return found;
  const rows = await tx
    .select({ abn: salons.abn, name: salons.name, postcode: salons.postcode })
    .from(salons)
    .where(
      or(
        abns.length ? inArray(salons.abn, abns) : undefined,
        inArray(sql<string>`lower(${salons.name}) || '|' || ${salons.postcode}`, keys),
      ),
    );
  for (const row of rows) {
    if (row.abn) found.abns.add(row.abn);
    found.keys.add(dupeKey(row.name, row.postcode));
  }
  return found;
}

// ---------------------------------------------------------------------------

export function backOffice(db: Db) {
  async function userById(id: string): Promise<AdminUser | null> {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async function salonById(id: string): Promise<AdminSalon | null> {
    const [row] = await db.select().from(salons).where(eq(salons.id, id)).limit(1);
    return row ?? null;
  }

  /** What is waiting for staff: the counts beside the portal's menu. */
  async function queues() {
    const [[checks], [abn], [claims]] = await Promise.all([
      db
        .select({ n: count() })
        .from(seekerChecks)
        .where(
          and(
            inArray(seekerChecks.status, OPEN_CHECK_STATUSES),
            inArray(seekerChecks.kind, [...REVIEWED_CHECK_KINDS]),
          ),
        ),
      db.select({ n: count() }).from(salons).where(eq(salons.abnStatus, "pending")),
      db.select({ n: count() }).from(salonClaims).where(eq(salonClaims.status, "pending_review")),
    ]);
    return {
      pendingChecks: checks?.n ?? 0,
      pendingAbn: abn?.n ?? 0,
      pendingClaims: claims?.n ?? 0,
    };
  }

  return {
    ...staffOffice(db),
    queues,

    /** The numbers on the overview, and the newest accounts. */
    async overview() {
      const week = new Date(Date.now() - 7 * DAY_MS);
      const one = async (query: Promise<{ n: number | string | null }[]>) =>
        Number((await query)[0]?.n ?? 0);
      const [
        seekers,
        idVerifiedSeekers,
        employers,
        salonsTotal,
        salonsClaimed,
        liveJobs,
        applicationsAll,
        applicationsWeek,
        signupsWeek,
        activePlans,
        revenueCents,
        waiting,
        newest,
      ] = await Promise.all([
        one(db.select({ n: count() }).from(users).where(eq(users.role, "seeker"))),
        one(
          db
            .select({ n: sql<number>`count(distinct ${seekerChecks.userId})::int` })
            .from(seekerChecks)
            .where(and(eq(seekerChecks.kind, "identity"), eq(seekerChecks.status, "verified"))),
        ),
        one(db.select({ n: count() }).from(users).where(eq(users.role, "employer"))),
        one(db.select({ n: count() }).from(salons)),
        one(db.select({ n: count() }).from(salons).where(isNotNull(salons.ownerId))),
        one(db.select({ n: count() }).from(jobs).where(live())),
        one(db.select({ n: count() }).from(applications)),
        one(db.select({ n: count() }).from(applications).where(gt(applications.createdAt, week))),
        one(db.select({ n: count() }).from(users).where(gt(users.createdAt, week))),
        one(
          db
            .select({ n: count() })
            .from(salons)
            .where(
              and(
                inArray(salons.subscriptionStatus, ["active", "trialing"]),
                or(
                  isNull(salons.subscriptionCurrentPeriodEnd),
                  gt(salons.subscriptionCurrentPeriodEnd, sql`now()`),
                ),
              ),
            ),
        ),
        one(
          db
            .select({ n: sum(payments.amountCents) })
            .from(payments)
            .where(eq(payments.status, "paid")),
        ),
        queues(),
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.id))
          .limit(8),
      ]);
      return {
        seekers,
        idVerifiedSeekers,
        employers,
        salons: {
          total: salonsTotal,
          claimed: salonsClaimed,
          unclaimed: salonsTotal - salonsClaimed,
        },
        liveJobs,
        applications: { week: applicationsWeek, all: applicationsAll },
        signupsWeek,
        activePlans,
        revenueCents,
        ...waiting,
        newest,
      };
    },

    // -----------------------------------------------------------------------
    // People
    // -----------------------------------------------------------------------

    users: {
      find: userById,

      /**
       * Newest first. `q` matches the email, name, phone number or a verification ID
       * (`SSV-…`).
       */
      async search(options: {
        limit: number;
        before?: string | undefined;
        q?: string | undefined;
        role?: UserRole | undefined;
        banned?: boolean | undefined;
        flagged?: boolean | undefined;
      }) {
        const q = options.q?.trim();
        const pattern = q ? contains(q) : undefined;
        const phone = q ? phonePattern(q) : null;
        const where = and(
          options.before ? lt(users.id, options.before) : undefined,
          options.role ? eq(users.role, options.role) : undefined,
          options.banned === undefined
            ? undefined
            : options.banned
              ? isNotNull(users.suspendedAt)
              : isNull(users.suspendedAt),
          options.flagged === undefined
            ? undefined
            : options.flagged
              ? sql`${openFlagCount} > 0`
              : sql`${openFlagCount} = 0`,
          q && pattern
            ? or(
                ilike(users.email, pattern),
                ilike(users.name, pattern),
                ilike(
                  sql`${seekerProfiles.firstName} || ' ' || ${seekerProfiles.lastName}`,
                  pattern,
                ),
                phone ? ilike(users.phoneNumber, phone) : undefined,
                phone ? ilike(seekerProfiles.phone, phone) : undefined,
                sql`exists (select 1 from ${seekerChecks} where ${seekerChecks.userId} = ${users.id} and ${seekerChecks.reference} = ${q.toUpperCase()})`,
              )
            : undefined,
        );
        const rows = await db
          .select({
            user: users,
            firstName: seekerProfiles.firstName,
            lastName: seekerProfiles.lastName,
            openFlags: openFlagCount,
            idVerified,
          })
          .from(users)
          .leftJoin(seekerProfiles, eq(seekerProfiles.userId, users.id))
          .where(where)
          .orderBy(desc(users.id))
          .limit(options.limit);
        return rows;
      },

      /** Everything staff see on a person's page. */
      async detail(id: string) {
        const [row] = await db
          .select({ user: users, profile: seekerProfiles })
          .from(users)
          .leftJoin(seekerProfiles, eq(seekerProfiles.userId, users.id))
          .where(eq(users.id, id))
          .limit(1);
        if (!row) return null;
        const [checks, applied, owned, flags, [active]] = await Promise.all([
          db
            .select()
            .from(seekerChecks)
            .where(eq(seekerChecks.userId, id))
            .orderBy(desc(seekerChecks.createdAt)),
          db
            .select({
              id: applications.id,
              status: applications.status,
              createdAt: applications.createdAt,
              job: {
                id: jobs.id,
                title: jobs.title,
                state: jobs.state,
                suburbSlug: jobs.suburbSlug,
                slug: jobs.slug,
              },
              salon: { id: salons.id, name: salons.name },
            })
            .from(applications)
            .innerJoin(jobs, eq(jobs.id, applications.jobId))
            .innerJoin(salons, eq(salons.id, jobs.salonId))
            .where(eq(applications.seekerId, id))
            .orderBy(desc(applications.createdAt)),
          db.select().from(salons).where(eq(salons.ownerId, id)).orderBy(salons.createdAt),
          db
            .select()
            .from(userFlags)
            .where(eq(userFlags.userId, id))
            .orderBy(desc(userFlags.createdAt)),
          db
            .select({ n: count() })
            .from(sessions)
            .where(and(eq(sessions.userId, id), gt(sessions.expiresAt, sql`now()`))),
        ]);
        return {
          ...row,
          checks,
          applications: applied,
          salons: owned,
          flags,
          activeSessions: active?.n ?? 0,
        };
      },

      async addFlag(user: AdminUser, reason: string, actor: Actor): Promise<AdminFlag> {
        return db.transaction(async (tx) => {
          const [flag] = await tx
            .insert(userFlags)
            .values({ userId: user.id, reason, createdBy: actor.id ?? user.id })
            .returning();
          await recordAudit(tx, actor, {
            action: "user.flagged",
            targetType: "user",
            targetId: user.id,
            after: { flag: flag?.id },
            reason,
          });
          return flag as AdminFlag;
        });
      },

      async findFlag(id: string): Promise<AdminFlag | null> {
        const [row] = await db.select().from(userFlags).where(eq(userFlags.id, id)).limit(1);
        return row ?? null;
      },

      async resolveFlag(flag: AdminFlag, actor: Actor): Promise<AdminFlag> {
        if (flag.resolvedAt) return flag;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(userFlags)
            .set({ resolvedAt: new Date() })
            .where(eq(userFlags.id, flag.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "user.flag_resolved",
            targetType: "user",
            targetId: flag.userId,
            before: { flag: flag.id, reason: flag.reason },
          });
          return row as AdminFlag;
        });
      },

      /** Bans someone: they're signed out everywhere at once and can't sign in again. */
      async ban(user: AdminUser, reason: string, actor: Actor): Promise<AdminUser> {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(users)
            .set({ suspendedAt: new Date(), suspendedReason: reason })
            .where(eq(users.id, user.id))
            .returning();
          const ended = await tx
            .delete(sessions)
            .where(eq(sessions.userId, user.id))
            .returning({ id: sessions.id });
          await recordAudit(tx, actor, {
            action: "user.banned",
            targetType: "user",
            targetId: user.id,
            after: { sessions_ended: ended.length },
            reason,
          });
          return row as AdminUser;
        });
      },

      async unban(user: AdminUser, actor: Actor): Promise<AdminUser> {
        if (!user.suspendedAt) return user;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(users)
            .set({ suspendedAt: null, suspendedReason: null })
            .where(eq(users.id, user.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "user.unbanned",
            targetType: "user",
            targetId: user.id,
            before: { reason: user.suspendedReason },
          });
          return row as AdminUser;
        });
      },

      /** Ends every session. Returns how many there were. */
      async signOutEverywhere(user: AdminUser, actor: Actor): Promise<number> {
        return db.transaction(async (tx) => {
          const ended = await tx
            .delete(sessions)
            .where(eq(sessions.userId, user.id))
            .returning({ id: sessions.id });
          await recordAudit(tx, actor, {
            action: "user.signed_out_everywhere",
            targetType: "user",
            targetId: user.id,
            after: { sessions_ended: ended.length },
          });
          return ended.length;
        });
      },

      async setRole(user: AdminUser, role: UserRole, actor: Actor): Promise<AdminUser> {
        if (user.role === role) return user;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(users)
            .set({ role })
            .where(eq(users.id, user.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "user.role_changed",
            targetType: "user",
            targetId: user.id,
            before: { role: user.role },
            after: { role },
          });
          return row as AdminUser;
        });
      },

      /**
       * Deletes someone and everything that is theirs: profile, applications, checks. A salon
       * they made goes too; a directory listing they claimed goes back to unclaimed. Returns the
       * files to delete from R2 once this has committed.
       */
      async delete(
        user: AdminUser,
        reason: string | undefined,
        actor: Actor,
      ): Promise<FilesToDelete> {
        return db.transaction(async (tx) => {
          const [profile] = await tx
            .select({ key: seekerProfiles.photoKey })
            .from(seekerProfiles)
            .where(eq(seekerProfiles.userId, user.id));
          const portfolio = await tx
            .select({ key: portfolioItems.imageKey })
            .from(portfolioItems)
            .where(eq(portfolioItems.userId, user.id));
          const evidence = await tx
            .select({ key: seekerChecks.documentKey })
            .from(seekerChecks)
            .where(and(eq(seekerChecks.userId, user.id), isNotNull(seekerChecks.documentKey)));
          const owned = await tx.select().from(salons).where(eq(salons.ownerId, user.id));
          const made = owned.filter((s) => s.source === "owner");
          const claimed = owned.filter((s) => s.source === "directory");

          if (made.length) {
            await tx.delete(salons).where(
              inArray(
                salons.id,
                made.map((s) => s.id),
              ),
            );
          }
          if (claimed.length) {
            await tx
              .update(salons)
              .set({ ownerId: null, claimedAt: null })
              .where(
                inArray(
                  salons.id,
                  claimed.map((s) => s.id),
                ),
              );
          }
          await tx.delete(users).where(eq(users.id, user.id));
          await recordAudit(tx, actor, {
            action: "user.deleted",
            targetType: "user",
            targetId: user.id,
            before: { name: user.name, email: user.email, role: user.role },
            after: {
              salons_deleted: made.map((s) => s.id),
              listings_unclaimed: claimed.map((s) => s.id),
            },
            reason,
          });
          return {
            media: [
              profile?.key,
              ...portfolio.map((p) => p.key),
              ...made.map((s) => s.logoKey),
            ].filter((key): key is string => Boolean(key)),
            private: evidence.map((e) => e.key).filter((key): key is string => Boolean(key)),
          };
        });
      },
    },

    // -----------------------------------------------------------------------
    // Salons
    // -----------------------------------------------------------------------

    salons: {
      find: salonById,

      /** Newest first. `q` matches the name, suburb, ABN or the owner's email. */
      async search(options: {
        limit: number;
        before?: string | undefined;
        q?: string | undefined;
        abnStatus?: VerificationStatus | undefined;
        claimed?: boolean | undefined;
        status?: SalonStatus | undefined;
      }) {
        const q = options.q?.trim();
        const where = and(
          options.before ? lt(salons.id, options.before) : undefined,
          options.abnStatus ? eq(salons.abnStatus, options.abnStatus) : undefined,
          options.status ? eq(salons.status, options.status) : undefined,
          options.claimed === undefined
            ? undefined
            : options.claimed
              ? isNotNull(salons.ownerId)
              : isNull(salons.ownerId),
          q
            ? or(
                ilike(salons.name, contains(q)),
                ilike(salons.suburb, contains(q)),
                ilike(salons.abn, contains(q.replace(/\s+/g, ""))),
                ilike(users.email, contains(q)),
              )
            : undefined,
        );
        return db
          .select({
            salon: salons,
            owner: { id: users.id, name: users.name, email: users.email },
            liveJobs: liveJobCount,
          })
          .from(salons)
          .leftJoin(users, eq(users.id, salons.ownerId))
          .where(where)
          .orderBy(desc(salons.id))
          .limit(options.limit);
      },

      /** The owner and live job count shown beside a salon in the list. */
      async summary(salon: AdminSalon) {
        const [owner, [liveRow]] = await Promise.all([
          salon.ownerId ? userById(salon.ownerId) : Promise.resolve(null),
          db
            .select({ n: count() })
            .from(jobs)
            .where(and(eq(jobs.salonId, salon.id), live())),
        ]);
        return {
          owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
          liveJobs: liveRow?.n ?? 0,
        };
      },

      /** Everything staff see on a salon's page. */
      async detail(id: string) {
        const salon = await salonById(id);
        if (!salon) return null;
        const [owner, salonJobs, salonPayments, claims] = await Promise.all([
          salon.ownerId ? userById(salon.ownerId) : Promise.resolve(null),
          db
            .select({ job: jobs, applicants: applicantCount })
            .from(jobs)
            .where(eq(jobs.salonId, id))
            .orderBy(desc(jobs.createdAt)),
          db
            .select()
            .from(payments)
            .where(eq(payments.salonId, id))
            .orderBy(desc(payments.createdAt)),
          db
            .select({
              claim: salonClaims,
              claimant: { id: users.id, name: users.name, email: users.email },
            })
            .from(salonClaims)
            .innerJoin(users, eq(users.id, salonClaims.userId))
            .where(eq(salonClaims.salonId, id))
            .orderBy(desc(salonClaims.createdAt)),
        ]);
        return { salon, owner, jobs: salonJobs, payments: salonPayments, claims };
      },

      /**
       * Suspended: its jobs are hidden and it can't post. Removed: also gone from the directory.
       * Both can be undone by setting it back to active.
       */
      async setStatus(
        salon: AdminSalon,
        status: SalonStatus,
        reason: string | undefined,
        actor: Actor,
      ): Promise<AdminSalon> {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(salons)
            .set({ status, statusReason: status === "active" ? null : (reason ?? null) })
            .where(eq(salons.id, salon.id))
            .returning();
          await recordAudit(tx, actor, {
            action: status === "active" ? "salon.reinstated" : `salon.${status}`,
            targetType: "salon",
            targetId: salon.id,
            before: { status: salon.status },
            after: { status },
            reason,
          });
          return row as AdminSalon;
        });
      },

      /** Deletes a salon with its jobs, applications, payments and claims. The owner's account stays. */
      async delete(
        salon: AdminSalon,
        reason: string | undefined,
        actor: Actor,
      ): Promise<FilesToDelete> {
        await db.transaction(async (tx) => {
          await tx.delete(salons).where(eq(salons.id, salon.id));
          await recordAudit(tx, actor, {
            action: "salon.deleted",
            targetType: "salon",
            targetId: salon.id,
            before: {
              name: salon.name,
              suburb: salon.suburb,
              state: salon.state,
              owner: salon.ownerId,
            },
            reason,
          });
        });
        return { media: salon.logoKey ? [salon.logoKey] : [], private: [] };
      },

      async setAbnStatus(
        salon: AdminSalon,
        status: "verified" | "failed",
        actor: Actor,
      ): Promise<AdminSalon> {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(salons)
            .set({ abnStatus: status })
            .where(eq(salons.id, salon.id))
            .returning();
          await recordAudit(tx, actor, {
            action: `salon.abn_${status}`,
            targetType: "salon",
            targetId: salon.id,
            before: { abn_status: salon.abnStatus },
            after: { abn_status: status, abn: salon.abn },
          });
          return row as AdminSalon;
        });
      },

      /** Extends the free period by `days` (from today if it has ended), or ends it now. */
      async setFreePeriod(
        salon: AdminSalon,
        change: { days: number } | { end: true },
        actor: Actor,
      ): Promise<AdminSalon> {
        const now = new Date();
        const from = salon.freeUntil && salon.freeUntil > now ? salon.freeUntil : now;
        const freeUntil = "end" in change ? now : new Date(from.getTime() + change.days * DAY_MS);
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(salons)
            .set({ freeUntil })
            .where(eq(salons.id, salon.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "end" in change ? "salon.free_period_ended" : "salon.free_period_extended",
            targetType: "salon",
            targetId: salon.id,
            before: { free_until: salon.freeUntil?.toISOString() ?? null },
            after: {
              free_until: freeUntil.toISOString(),
              ...("days" in change ? { days: change.days } : {}),
            },
          });
          return row as AdminSalon;
        });
      },

      /** Gives (or with a negative `delta`, takes away) listing credits. Never below zero. */
      async adjustCredits(
        salon: AdminSalon,
        delta: number,
        reason: string,
        actor: Actor,
      ): Promise<AdminSalon> {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(salons)
            .set({ listingCredits: sql`greatest(${salons.listingCredits} + ${delta}, 0)` })
            .where(eq(salons.id, salon.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "salon.credits_changed",
            targetType: "salon",
            targetId: salon.id,
            before: { credits: salon.listingCredits },
            after: { credits: row?.listingCredits, delta },
            reason,
          });
          return row as AdminSalon;
        });
      },

      async setFounding(salon: AdminSalon, founding: boolean, actor: Actor): Promise<AdminSalon> {
        if (salon.founding === founding) return salon;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(salons)
            .set({ founding })
            .where(eq(salons.id, salon.id))
            .returning();
          await recordAudit(tx, actor, {
            action: founding ? "salon.founding_on" : "salon.founding_off",
            targetType: "salon",
            targetId: salon.id,
          });
          return row as AdminSalon;
        });
      },

      /** Detaches the owner: the salon becomes an unclaimed directory listing anyone can claim. */
      async unclaim(salon: AdminSalon, actor: Actor): Promise<AdminSalon> {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(salons)
            .set({ ownerId: null, claimedAt: null, source: "directory" })
            .where(eq(salons.id, salon.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "salon.unclaimed",
            targetType: "salon",
            targetId: salon.id,
            before: { owner: salon.ownerId, source: salon.source },
          });
          return row as AdminSalon;
        });
      },
    },

    // -----------------------------------------------------------------------
    // The directory
    // -----------------------------------------------------------------------

    directory: {
      /** Adds one unclaimed listing. Throws `DuplicateListingError` if it is already listed. */
      async add(input: ListingInput, actor: Actor): Promise<AdminSalon> {
        return db.transaction(async (tx) => {
          const existing = await existingListings(tx, [input]);
          if ((input.abn && existing.abns.has(input.abn)) || existing.keys.size > 0) {
            throw new DuplicateListingError();
          }
          const suburbSlug = slugify(input.suburb);
          const place = placeKey(input.state, suburbSlug);
          const taken = (await takenSlugs(tx, [place])).get(place) ?? new Set();
          const slug = nextFreeSlug(slugify(input.name) || "salon", taken);
          const [row] = await tx
            .insert(salons)
            .values(listingRow(input, slug, suburbSlug))
            .returning();
          const salon = row as AdminSalon;
          await recordAudit(tx, actor, {
            action: "directory.listing_added",
            targetType: "salon",
            targetId: salon.id,
            after: { name: salon.name, suburb: salon.suburb, state: salon.state },
          });
          return salon;
        });
      },

      /**
       * Imports listings from a CSV. Rows already listed (same ABN, or same name and postcode)
       * are counted as duplicates and skipped; rows that don't check out are reported.
       */
      async importCsv(text: string, actor: Actor) {
        const rows = parseCsv(text);
        const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
        const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
        if (missing.length) {
          throw new DirectoryImportError(
            `The first row must be the header, with at least ${REQUIRED_COLUMNS.join(", ")} (missing ${missing.join(", ")})`,
          );
        }
        if (rows.length < 2) throw new DirectoryImportError("The CSV has a header but no listings");
        if (rows.length - 1 > DIRECTORY_IMPORT_MAX_ROWS) {
          throw new DirectoryImportError(
            `The CSV has ${rows.length - 1} listings; import up to ${DIRECTORY_IMPORT_MAX_ROWS.toLocaleString("en-AU")} at a time`,
          );
        }

        const errors: { row: number; message: string }[] = [];
        const valid: ListingInput[] = [];
        for (const [index, cells] of rows.slice(1).entries()) {
          const raw = Object.fromEntries(header.map((column, i) => [column, cells[i]]));
          const input = cleanListing(raw);
          // Row 1 is the header.
          if (typeof input === "string") errors.push({ row: index + 2, message: input });
          else valid.push(input);
        }

        return db.transaction(async (tx) => {
          const existing = await existingListings(tx, valid);
          const fresh: ListingInput[] = [];
          let duplicates = 0;
          for (const input of valid) {
            const key = dupeKey(input.name, input.postcode);
            if ((input.abn && existing.abns.has(input.abn)) || existing.keys.has(key)) {
              duplicates++;
              continue;
            }
            // A row repeated within the file counts as a duplicate too.
            if (input.abn) existing.abns.add(input.abn);
            existing.keys.add(key);
            fresh.push(input);
          }

          const placed = fresh.map((input) => {
            const suburbSlug = slugify(input.suburb);
            return { input, suburbSlug, place: placeKey(input.state, suburbSlug) };
          });
          const taken = await takenSlugs(tx, [...new Set(placed.map((p) => p.place))]);
          const values = placed.map(({ input, suburbSlug, place }) => {
            const used = taken.get(place) ?? new Set<string>();
            const slug = nextFreeSlug(slugify(input.name) || "salon", used);
            used.add(slug);
            taken.set(place, used);
            return listingRow(input, slug, suburbSlug);
          });
          // Postgres takes up to 65,535 parameters per statement.
          for (let i = 0; i < values.length; i += 500) {
            await tx.insert(salons).values(values.slice(i, i + 500));
          }
          const report = { added: values.length, duplicates, errors };
          await recordAudit(tx, actor, {
            action: "directory.imported",
            targetType: "directory",
            after: { added: report.added, duplicates, errors: errors.length },
          });
          return report;
        });
      },
    },

    // -----------------------------------------------------------------------
    // Jobs and payments
    // -----------------------------------------------------------------------

    jobs: {
      async find(id: string): Promise<AdminJob | null> {
        const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
        return row ?? null;
      },

      /** Newest first. `q` matches the title, the salon's name or the suburb. */
      async search(options: {
        limit: number;
        before?: string | undefined;
        q?: string | undefined;
        status?: AdminJobFilter | undefined;
        id?: string | undefined;
      }) {
        const q = options.q?.trim();
        const filters: Record<AdminJobFilter, SQL | undefined> = {
          live: live(),
          expired: and(eq(jobs.status, "published"), lte(jobs.expiresAt, sql`now()`)),
          draft: eq(jobs.status, "draft"),
          closed: eq(jobs.status, "closed"),
          featured: eq(jobs.featured, true),
        };
        const where = and(
          options.before ? lt(jobs.id, options.before) : undefined,
          options.id ? eq(jobs.id, options.id) : undefined,
          options.status ? filters[options.status] : undefined,
          q
            ? or(
                ilike(jobs.title, contains(q)),
                ilike(salons.name, contains(q)),
                ilike(jobs.suburb, contains(q)),
              )
            : undefined,
        );
        return db
          .select({
            job: jobs,
            salon: { id: salons.id, name: salons.name, status: salons.status },
            applicants: applicantCount,
          })
          .from(jobs)
          .innerJoin(salons, eq(salons.id, jobs.salonId))
          .where(where)
          .orderBy(desc(jobs.id))
          .limit(options.limit);
      },

      async setFeatured(job: AdminJob, featured: boolean, actor: Actor): Promise<AdminJob> {
        if (job.featured === featured) return job;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(jobs)
            .set({ featured })
            .where(eq(jobs.id, job.id))
            .returning();
          await recordAudit(tx, actor, {
            action: featured ? "job.featured" : "job.unfeatured",
            targetType: "job",
            targetId: job.id,
          });
          return row as AdminJob;
        });
      },

      /** Closes a job that breaks the rules (spam, a scam, discrimination…). */
      async takeDown(job: AdminJob, reason: string, actor: Actor): Promise<AdminJob> {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(jobs)
            .set({ status: "closed" })
            .where(eq(jobs.id, job.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "job.taken_down",
            targetType: "job",
            targetId: job.id,
            before: { status: job.status },
            reason,
          });
          return row as AdminJob;
        });
      },

      /** Puts a job live for a fresh listing period without charging the salon. */
      async relist(job: AdminJob, actor: Actor): Promise<AdminJob> {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + PRICING.listingDurationDays * DAY_MS);
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(jobs)
            .set({ status: "published", paidVia: "staff", publishedAt: now, expiresAt })
            .where(eq(jobs.id, job.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "job.relisted",
            targetType: "job",
            targetId: job.id,
            before: { status: job.status, expires_at: job.expiresAt?.toISOString() ?? null },
            after: { expires_at: expiresAt.toISOString() },
          });
          return row as AdminJob;
        });
      },
    },

    payments: {
      /** Newest first. */
      list(options: { limit: number; before?: string | undefined }) {
        return db
          .select({ payment: payments, salon: { id: salons.id, name: salons.name } })
          .from(payments)
          .innerJoin(salons, eq(salons.id, payments.salonId))
          .where(options.before ? lt(payments.id, options.before) : undefined)
          .orderBy(desc(payments.id))
          .limit(options.limit);
      },
    },

    // -----------------------------------------------------------------------
    // Queues: checks and claims. Deciding them is in checks.ts and claims.ts.
    // -----------------------------------------------------------------------

    checks: {
      async find(id: string): Promise<AdminCheck | null> {
        const [row] = await db.select().from(seekerChecks).where(eq(seekerChecks.id, id)).limit(1);
        return row ?? null;
      },

      /** Right-to-work and qualification checks, oldest first when pending, else newest first. */
      list(options: {
        limit: number;
        before?: string | undefined;
        status: "pending" | "all";
        id?: string | undefined;
      }) {
        const pending = options.status === "pending";
        return db
          .select({
            check: seekerChecks,
            user: {
              id: users.id,
              name: users.name,
              email: users.email,
              phoneNumber: users.phoneNumber,
            },
            firstName: seekerProfiles.firstName,
            lastName: seekerProfiles.lastName,
          })
          .from(seekerChecks)
          .innerJoin(users, eq(users.id, seekerChecks.userId))
          .leftJoin(seekerProfiles, eq(seekerProfiles.userId, users.id))
          .where(
            and(
              inArray(seekerChecks.kind, [...REVIEWED_CHECK_KINDS]),
              pending ? inArray(seekerChecks.status, OPEN_CHECK_STATUSES) : undefined,
              options.id ? eq(seekerChecks.id, options.id) : undefined,
              options.before
                ? pending
                  ? gt(seekerChecks.id, options.before)
                  : lt(seekerChecks.id, options.before)
                : undefined,
            ),
          )
          .orderBy(pending ? seekerChecks.id : desc(seekerChecks.id))
          .limit(options.limit);
      },
    },

    claims: {
      async find(id: string): Promise<AdminClaim | null> {
        const [row] = await db.select().from(salonClaims).where(eq(salonClaims.id, id)).limit(1);
        return row ?? null;
      },

      /** `open`: still waiting (for staff, or for the claimant's email link). Newest first. */
      list(options: {
        limit: number;
        before?: string | undefined;
        status: "open" | "all";
        id?: string | undefined;
      }) {
        return db
          .select({
            claim: salonClaims,
            salon: {
              id: salons.id,
              name: salons.name,
              suburb: salons.suburb,
              state: salons.state,
              abn: salons.abn,
              email: salons.email,
              phone: salons.phone,
              ownerId: salons.ownerId,
              slug: salons.slug,
              suburbSlug: salons.suburbSlug,
            },
            claimant: {
              id: users.id,
              name: users.name,
              email: users.email,
              phoneNumber: users.phoneNumber,
            },
          })
          .from(salonClaims)
          .innerJoin(salons, eq(salons.id, salonClaims.salonId))
          .innerJoin(users, eq(users.id, salonClaims.userId))
          .where(
            and(
              options.status === "open"
                ? inArray(salonClaims.status, ["pending_review", "pending_email"])
                : undefined,
              options.before ? lt(salonClaims.id, options.before) : undefined,
              options.id ? eq(salonClaims.id, options.id) : undefined,
            ),
          )
          .orderBy(desc(salonClaims.id))
          .limit(options.limit);
      },
    },
  };
}

export type BackOffice = ReturnType<typeof backOffice>;
