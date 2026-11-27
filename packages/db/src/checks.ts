/**
 * Job seekers' verification checks: identity (Stripe Identity, or a mock locally), right to work
 * and qualifications (reviewed by staff).
 *
 * The data rule (D-03): once a check is decided only its verification ID (`SSV-…`), outcome, date
 * and a minimal result are kept. Certificates and visa details are deleted on decision, or after
 * 30 days if nobody decides.
 */
import {
  ApiError,
  nameMatches,
  RIGHT_TO_WORK_BASIS_VALUES,
  type RightToWorkBasis,
  type RightToWorkInput,
  type VerificationStatus,
  verificationLevel,
  verificationReference,
} from "@salonstaff/shared";
import { and, asc, count, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { type Actor, recordAudit } from "./audit";
import type { Db } from "./index";
import { type CheckKind, seekerChecks, seekerEducation, seekerProfiles, users } from "./schema";

export type Check = typeof seekerChecks.$inferSelect;

export interface CheckSummary {
  identity: VerificationStatus;
  rightToWork: VerificationStatus;
  qualification: VerificationStatus;
  /** 0 = not verified, 1 = ID verified, 2 = work-ready. */
  level: 0 | 1 | 2;
  /** Verification IDs of the passed checks: what salons are shown. */
  references: { identity?: string; rightToWork?: string; qualification?: string };
  /** Whether the name on the ID matched the profile when it was checked. */
  nameMatched: boolean | null;
  identityVerifiedAt: Date | null;
  qualificationTitle: string | null;
  /** For a passed right-to-work check: the basis staff checked, and how (`VEVO`, `ID document`). */
  rightToWorkBasis: RightToWorkBasis | null;
  rightToWorkCheckedVia: string | null;
}

const basisOf = (value: unknown): RightToWorkBasis | null =>
  (RIGHT_TO_WORK_BASIS_VALUES as readonly unknown[]).includes(value)
    ? (value as RightToWorkBasis)
    : null;

/** Kinds staff decide. Identity is decided by the provider. */
const REVIEWED: CheckKind[] = ["right_to_work", "qualification"];
const OPEN: VerificationStatus[] = ["pending", "requires_input"];

/** The check that counts for each kind: a pass beats a later failed retry, otherwise the newest. */
function latestByKind(rows: Check[]): Partial<Record<CheckKind, Check>> {
  const latest: Partial<Record<CheckKind, Check>> = {};
  // Newest first.
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const existing = latest[row.kind];
    if (!existing || (existing.status !== "verified" && row.status === "verified")) {
      latest[row.kind] = row;
    }
  }
  return latest;
}

export function summarise(rows: Check[]): CheckSummary {
  const latest = latestByKind(rows);
  const status = (kind: CheckKind): VerificationStatus => latest[kind]?.status ?? "not_started";
  const passed = (kind: CheckKind) =>
    latest[kind]?.status === "verified" ? (latest[kind] as Check) : undefined;
  const references: CheckSummary["references"] = {};
  const id = passed("identity");
  const rtw = passed("right_to_work");
  const qual = passed("qualification");
  if (id?.reference) references.identity = id.reference;
  if (rtw?.reference) references.rightToWork = rtw.reference;
  if (qual?.reference) references.qualification = qual.reference;
  const identity = status("identity");
  const rightToWork = status("right_to_work");
  return {
    identity,
    rightToWork,
    qualification: status("qualification"),
    level: verificationLevel(identity, rightToWork),
    references,
    nameMatched: typeof id?.result.nameMatched === "boolean" ? id.result.nameMatched : null,
    identityVerifiedAt: id?.decidedAt ?? null,
    qualificationTitle: typeof qual?.result.title === "string" ? qual.result.title : null,
    rightToWorkBasis: basisOf(rtw?.result.basis),
    rightToWorkCheckedVia:
      typeof rtw?.result.checkedVia === "string" ? rtw.result.checkedVia : null,
  };
}

/** Where a qualification check of one education entry is up to, from all their checks. */
export interface EducationCheck {
  status: VerificationStatus;
  /** The verification ID, once passed. */
  reference: string | null;
}

/** Each education entry's check: a pass beats a later failed retry, otherwise the newest. */
export function educationChecks(rows: Check[]): Map<string, EducationCheck> {
  const byEducation = new Map<string, Check>();
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (row.kind !== "qualification" || !row.educationId) continue;
    const existing = byEducation.get(row.educationId);
    if (!existing || (existing.status !== "verified" && row.status === "verified")) {
      byEducation.set(row.educationId, row);
    }
  }
  return new Map(
    [...byEducation].map(([id, row]) => [
      id,
      { status: row.status, reference: row.status === "verified" ? row.reference : null },
    ]),
  );
}

/** Summaries for several people at once (applicant lists). */
export async function summariesFor(db: Db, userIds: string[]): Promise<Map<string, CheckSummary>> {
  const rows = userIds.length
    ? await db.select().from(seekerChecks).where(inArray(seekerChecks.userId, userIds))
    : [];
  return new Map(userIds.map((id) => [id, summarise(rows.filter((r) => r.userId === id))]));
}

/** What stays of a decided check: never a document number or a file (D-03). */
function minimalResult(check: Check): Record<string, unknown> {
  if (check.kind === "right_to_work") {
    const basis = check.result.basis;
    return { basis, checkedVia: basis === "visa" ? "VEVO" : "ID document" };
  }
  if (check.kind === "qualification") {
    const { title, institution, year } = check.result;
    return { title, institution, year };
  }
  return typeof check.result.nameMatched === "boolean"
    ? { nameMatched: check.result.nameMatched }
    : {};
}

export interface ReviewOutcome {
  check: Check;
  /** Files in the PRIVATE bucket the caller must now delete. */
  evidenceKeys: string[];
}

export function checks(db: Db) {
  return {
    summariesFor: (userIds: string[]) => summariesFor(db, userIds),

    /** One person's checks, newest first. */
    async listFor(userId: string): Promise<Check[]> {
      return db
        .select()
        .from(seekerChecks)
        .where(eq(seekerChecks.userId, userId))
        .orderBy(desc(seekerChecks.createdAt));
    },

    async summaryFor(userId: string): Promise<CheckSummary> {
      return summarise(await this.listFor(userId));
    },

    async find(checkId: string): Promise<Check | null> {
      const [row] = await db.select().from(seekerChecks).where(eq(seekerChecks.id, checkId));
      return row ?? null;
    },

    async findByProviderRef(providerRef: string): Promise<Check | null> {
      const [row] = await db
        .select()
        .from(seekerChecks)
        .where(and(eq(seekerChecks.providerRef, providerRef), eq(seekerChecks.kind, "identity")));
      return row ?? null;
    },

    /** Staff search: "is this verification ID real, and whose is it?" */
    async findByReference(reference: string): Promise<Check | null> {
      const [row] = await db
        .select()
        .from(seekerChecks)
        .where(eq(seekerChecks.reference, reference.trim().toUpperCase()));
      return row ?? null;
    },

    /** How many identity checks this person started in the last 24 hours. */
    async identityStartedToday(userId: string): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(seekerChecks)
        .where(
          and(
            eq(seekerChecks.userId, userId),
            eq(seekerChecks.kind, "identity"),
            gt(seekerChecks.createdAt, new Date(Date.now() - 24 * 60 * 60_000)),
          ),
        );
      return row?.n ?? 0;
    },

    /** Records a new identity check, started with the provider (`stripe`, or `mock` locally). */
    async startIdentity(
      userId: string,
      input: { provider: "stripe" | "mock"; providerRef: string },
      actor: Actor,
    ): Promise<Check> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(seekerChecks)
          .values({
            userId,
            kind: "identity",
            provider: input.provider,
            providerRef: input.providerRef,
          })
          .returning();
        const check = row as Check;
        await recordAudit(tx, actor, {
          action: "check.started",
          targetType: "check",
          targetId: check.id,
          after: { kind: "identity", provider: input.provider },
        });
        return check;
      });
    },

    /**
     * Records the provider's answer. The name on the ID is compared with the profile here and
     * then forgotten: only whether it matched is kept. A pass gets its verification ID.
     */
    async completeIdentity(
      providerRef: string,
      outcome: {
        status: "verified" | "requires_input" | "failed";
        idName?: { firstName?: string | null; lastName?: string | null } | undefined;
      },
      actor: Actor,
    ): Promise<Check | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(seekerChecks)
          .where(and(eq(seekerChecks.providerRef, providerRef), eq(seekerChecks.kind, "identity")))
          .for("update");
        // A pass is final: a late "requires input" for the same session changes nothing.
        if (!row || row.status === "verified") return row ?? null;
        const verified = outcome.status === "verified";
        let nameMatched = false;
        if (verified && outcome.idName) {
          const [profile] = await tx
            .select({ firstName: seekerProfiles.firstName, lastName: seekerProfiles.lastName })
            .from(seekerProfiles)
            .where(eq(seekerProfiles.userId, row.userId));
          nameMatched = profile ? nameMatches(profile, outcome.idName) : false;
        }
        const decided = outcome.status !== "requires_input";
        const [updated] = await tx
          .update(seekerChecks)
          .set({
            status: outcome.status,
            reference: verified ? (row.reference ?? verificationReference()) : row.reference,
            result: verified ? { nameMatched } : {},
            decidedAt: decided ? new Date() : null,
          })
          .where(eq(seekerChecks.id, row.id))
          .returning();
        await recordAudit(tx, actor, {
          action: `check.${outcome.status}`,
          targetType: "check",
          targetId: row.id,
          before: { status: row.status },
          after: { status: outcome.status, ...(verified ? { nameMatched } : {}) },
        });
        return updated ?? null;
      });
    },

    /** Right to work, checked by staff (VEVO for visas). Visa details are kept only until then. */
    async submitRightToWork(userId: string, input: RightToWorkInput, actor: Actor): Promise<Check> {
      return submitForReview(db, userId, "right_to_work", actor, {
        result: {
          basis: input.basis,
          visaGrantNumber: input.basis === "visa" ? (input.visaGrantNumber ?? null) : null,
          passportCountry: input.passportCountry || null,
        },
      });
    },

    /**
     * A certificate for one of their education entries, in the PRIVATE bucket only until staff
     * decide. One check at a time per entry; a verified entry needs no more.
     */
    async submitQualification(
      userId: string,
      input: { educationId: string; documentKey: string },
      actor: Actor,
    ): Promise<Check> {
      return db.transaction(async (tx) => {
        const [education] = await tx
          .select()
          .from(seekerEducation)
          .where(and(eq(seekerEducation.id, input.educationId), eq(seekerEducation.userId, userId)))
          .for("update");
        if (!education) {
          throw new ApiError("not_found", {
            detail: "You have no education entry with that ID",
            hint: "Add the qualification to your education (POST /v1/me/education), then send its `id`.",
          });
        }
        const existing = await tx
          .select()
          .from(seekerChecks)
          .where(
            and(eq(seekerChecks.educationId, education.id), eq(seekerChecks.kind, "qualification")),
          );
        if (existing.some((row) => OPEN.includes(row.status))) {
          throw new ApiError("conflict", {
            detail: "This qualification is already waiting for review",
            hint: "Wait for the decision (usually within two business days) before sending another.",
          });
        }
        if (existing.some((row) => row.status === "verified")) {
          throw new ApiError("conflict", {
            detail: "This qualification is already verified",
            hint: "Nothing more is needed for it.",
          });
        }
        const [row] = await tx
          .insert(seekerChecks)
          .values({
            userId,
            kind: "qualification",
            provider: "manual",
            status: "pending",
            educationId: education.id,
            documentKey: input.documentKey,
            result: {
              title: education.qualification,
              institution: education.institution,
              year: education.year,
            },
          })
          .returning();
        const check = row as Check;
        await recordAudit(tx, actor, {
          action: "check.submitted",
          targetType: "check",
          targetId: check.id,
          after: { kind: "qualification", educationId: education.id },
        });
        return check;
      });
    },

    /** Checks waiting for staff, oldest first. */
    async queue(): Promise<Check[]> {
      return db
        .select()
        .from(seekerChecks)
        .where(and(inArray(seekerChecks.status, OPEN), inArray(seekerChecks.kind, REVIEWED)))
        .orderBy(asc(seekerChecks.createdAt));
    },

    /**
     * Staff decide a right-to-work or qualification check. The evidence is scrubbed in the same
     * transaction (visa and passport details, the certificate's key); the caller deletes the
     * returned files from the PRIVATE bucket.
     */
    async review(
      checkId: string,
      decision: "verified" | "failed",
      staffId: string,
      note?: string | undefined,
      context: Omit<Actor, "type" | "id"> = {},
    ): Promise<ReviewOutcome> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(seekerChecks)
          .where(eq(seekerChecks.id, checkId))
          .for("update");
        if (!row) {
          throw new ApiError("not_found", {
            detail: "No check with that ID",
            hint: "Pick a check from the review queue.",
          });
        }
        if (!REVIEWED.includes(row.kind)) {
          throw new ApiError("conflict", {
            detail: "Identity checks are decided by the identity provider, not by staff",
            hint: "Only right-to-work and qualification checks can be reviewed.",
          });
        }
        if (!OPEN.includes(row.status)) {
          throw new ApiError("conflict", {
            detail: "This check has already been decided",
            hint: "Reload the review queue: someone else may have decided it.",
          });
        }
        const [updated] = await tx
          .update(seekerChecks)
          .set({
            status: decision,
            reference:
              decision === "verified" ? (row.reference ?? verificationReference()) : row.reference,
            result: minimalResult(row),
            documentKey: null,
            reviewedBy: staffId,
            reviewNote: note?.trim() || null,
            decidedAt: new Date(),
          })
          .where(eq(seekerChecks.id, row.id))
          .returning();
        await recordAudit(
          tx,
          { ...context, type: "staff", id: staffId },
          {
            action: `check.${decision}`,
            targetType: "check",
            targetId: row.id,
            before: { status: row.status, kind: row.kind },
            after: { status: decision },
            reason: note,
          },
        );
        return {
          check: updated as Check,
          evidenceKeys: row.documentKey ? [row.documentKey] : [],
        };
      });
    },

    /**
     * Data retention: checks still waiting for staff after `days` are closed as failed and their
     * evidence scrubbed. Returns the PRIVATE bucket keys the caller must delete.
     */
    async purgeStale(days = 30): Promise<{ purged: number; evidenceKeys: string[] }> {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return db.transaction(async (tx) => {
        const stale = await tx
          .select()
          .from(seekerChecks)
          .where(
            and(
              inArray(seekerChecks.status, OPEN),
              inArray(seekerChecks.kind, REVIEWED),
              lt(seekerChecks.createdAt, cutoff),
            ),
          )
          .for("update");
        for (const row of stale) {
          await tx
            .update(seekerChecks)
            .set({
              status: "failed",
              result: {},
              documentKey: null,
              reviewNote: "Expired without review",
              decidedAt: new Date(),
            })
            .where(eq(seekerChecks.id, row.id));
          await recordAudit(
            tx,
            { type: "system" },
            {
              action: "check.expired",
              targetType: "check",
              targetId: row.id,
              before: { status: row.status, kind: row.kind },
              after: { status: "failed" },
              reason: `Not reviewed within ${days} days`,
            },
          );
        }
        return {
          purged: stale.length,
          evidenceKeys: stale.flatMap((row) => (row.documentKey ? [row.documentKey] : [])),
        };
      });
    },

    /** Whether the person has an account that isn't banned (for notifying them). */
    async contactOf(userId: string) {
      const [row] = await db
        .select({ userId: users.id, email: users.email, phoneNumber: users.phoneNumber })
        .from(users)
        .where(and(eq(users.id, userId), sql`${users.suspendedAt} is null`));
      return row ?? null;
    },
  };
}

async function submitForReview(
  db: Db,
  userId: string,
  kind: CheckKind,
  actor: Actor,
  values: { result: Record<string, unknown>; documentKey?: string },
): Promise<Check> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(seekerChecks)
      .where(and(eq(seekerChecks.userId, userId), eq(seekerChecks.kind, kind)))
      .for("update");
    if (existing.some((row) => OPEN.includes(row.status))) {
      throw new ApiError("conflict", {
        detail: "A check of this kind is already waiting for review",
        hint: "Wait for the decision (usually within two business days) before sending another.",
      });
    }
    if (kind === "right_to_work" && existing.some((row) => row.status === "verified")) {
      throw new ApiError("conflict", {
        detail: "Your right to work is already verified",
        hint: "Nothing more is needed. Contact support if your work rights have changed.",
      });
    }
    const [row] = await tx
      .insert(seekerChecks)
      .values({ userId, kind, provider: "manual", status: "pending", ...values })
      .returning();
    const check = row as Check;
    // The audit log never holds the evidence itself.
    await recordAudit(tx, actor, {
      action: "check.submitted",
      targetType: "check",
      targetId: check.id,
      after: { kind },
    });
    return check;
  });
}
