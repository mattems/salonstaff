/**
 * Claiming a directory listing (D-04). ABNs are public, so a claim needs a matching ABN *and*
 * proof of control: a link sent to the listing's business email (48 hours, single use), or
 * staff approval. An approved claim makes the claimant an owner (D-11): any account can claim any
 * number of listings, including ones that already have owners (who are told). A listing's first
 * claim gets the same launch terms as a new salon.
 */
import { ApiError, CONTACT_LIMITS, isValidAbn, randomToken, sha256Hex } from "@salonstaff/shared";
import { and, count, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import type { Db } from "./index";
import { type AbnCheck, type Contact, launchTerms, makeEmployer } from "./salon";
import { type ClaimStatus, salonClaims, salonMembers, salons, users } from "./schema";
import { addMember, ownerContacts } from "./team";
import { type Salon, visibleSalon } from "./visibility";

export type Claim = typeof salonClaims.$inferSelect;

export const CLAIM_LINK_HOURS = 48;
/** A claim link is sent again to the same listing for the same person at most this often. */
export const CLAIM_RESEND_MINUTES = 5;
const OPEN: ClaimStatus[] = ["pending_email", "pending_review"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Who decided: a staff member's ID, `email-link`, or `system`. */
const actorFor = (decidedBy: string): Actor =>
  UUID_RE.test(decidedBy) ? { type: "staff", id: decidedBy } : { type: "system" };

export interface ClaimDecision {
  claim: Claim;
  salon: Salon;
  /** The claimant, to tell them. Null if their account is gone or banned. */
  contact: Contact | null;
  /** When an approved claim joined a salon that already had owners: those owners, to tell them. */
  otherOwners: Contact[];
}

export interface OpenClaim {
  claim: Claim;
  salon: Salon;
  claimant: { id: string; name: string } & Contact;
}

async function contactOf(tx: Executor, userId: string): Promise<Contact | null> {
  const [row] = await tx
    .select({
      userId: users.id,
      email: users.email,
      phoneNumber: users.phoneNumber,
      suspendedAt: users.suspendedAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row && !row.suspendedAt
    ? { userId: row.userId, email: row.email, phoneNumber: row.phoneNumber }
    : null;
}

async function roleOn(tx: Executor, userId: string, salonId: string) {
  const [row] = await tx
    .select({ role: salonMembers.role })
    .from(salonMembers)
    .where(and(eq(salonMembers.userId, userId), eq(salonMembers.salonId, salonId)));
  return row?.role ?? null;
}

async function hasOwners(tx: Executor, salonId: string): Promise<boolean> {
  const [row] = await tx
    .select({ userId: salonMembers.userId })
    .from(salonMembers)
    .where(and(eq(salonMembers.salonId, salonId), eq(salonMembers.role, "owner")))
    .limit(1);
  return Boolean(row);
}

export function claims(db: Db) {
  return {
    async find(claimId: string): Promise<Claim | null> {
      const [row] = await db.select().from(salonClaims).where(eq(salonClaims.id, claimId));
      return row ?? null;
    },

    /** Claims waiting for a decision (or a click), oldest first, with the listing and claimant. */
    async open(): Promise<OpenClaim[]> {
      const rows = await db
        .select({
          claim: salonClaims,
          salon: salons,
          id: users.id,
          name: users.name,
          email: users.email,
          phoneNumber: users.phoneNumber,
        })
        .from(salonClaims)
        .innerJoin(salons, eq(salons.id, salonClaims.salonId))
        .innerJoin(users, eq(users.id, salonClaims.userId))
        .where(inArray(salonClaims.status, OPEN))
        .orderBy(salonClaims.createdAt);
      return rows.map(({ claim, salon, ...claimant }) => ({
        claim,
        salon,
        claimant: { ...claimant, userId: claimant.id },
      }));
    },

    /** The person's most recent claim on a listing. */
    async mine(salonId: string, userId: string): Promise<Claim | null> {
      const [row] = await db
        .select()
        .from(salonClaims)
        .where(and(eq(salonClaims.salonId, salonId), eq(salonClaims.userId, userId)))
        .orderBy(desc(salonClaims.createdAt))
        .limit(1);
      return row ?? null;
    },

    /**
     * Starts a claim. `abr` is the Australian Business Register's answer for the ABN, looked up
     * by the caller. With `method: "email"` and a listing email, returns the one-time `token` for
     * the link the caller emails to that address; only its hash is stored.
     */
    async start(
      input: {
        salonId: string;
        userId: string;
        abn: string;
        contactName: string;
        phone: string;
        method: "email" | "review";
        abr: AbnCheck;
      },
      actor: Actor,
    ): Promise<{ claim: Claim; salon: Salon; token: string | null }> {
      const abn = input.abn.replace(/\s+/g, "");
      if (!isValidAbn(abn)) {
        throw new ApiError("validation_failed", {
          detail: "That ABN isn't valid",
          hint: "Check the 11 digits at abr.business.gov.au.",
          errors: [{ path: "abn", message: "Not a valid ABN" }],
        });
      }
      return db.transaction(async (tx) => {
        const [salon] = await tx
          .select()
          .from(salons)
          .where(and(eq(salons.id, input.salonId), visibleSalon()))
          .for("update");
        if (!salon) {
          throw new ApiError("not_found", {
            detail: "No salon listing with that ID",
            hint: "Find the listing with GET /v1/salons.",
          });
        }
        // A manager may claim to become an owner; an owner has nothing to claim.
        if ((await roleOn(tx, input.userId, salon.id)) === "owner") {
          throw new ApiError("conflict", {
            detail: "You already own this salon",
            hint: "Manage it under GET /v1/employer/salons.",
          });
        }
        if (salon.abn && salon.abn !== abn) {
          throw new ApiError("conflict", {
            detail: "That ABN doesn't match the one we have for this business",
            hint: "Check the ABN. If the business's ABN has changed, contact support@salonstaff.com.au.",
            errors: [{ path: "abn", message: "Doesn't match the listing" }],
          });
        }
        if (input.abr.status === "failed") {
          throw new ApiError("validation_failed", {
            detail: "That ABN isn't active on the Australian Business Register",
            hint: "Check it at abr.business.gov.au. A claim needs the business's current ABN.",
            errors: [{ path: "abn", message: "Not active" }],
          });
        }
        // And one account can start only so many a day, across every listing.
        const [today] = await tx
          .select({ n: count() })
          .from(salonClaims)
          .where(
            and(
              eq(salonClaims.userId, input.userId),
              gt(salonClaims.createdAt, new Date(Date.now() - 24 * 60 * 60_000)),
            ),
          );
        if ((today?.n ?? 0) >= CONTACT_LIMITS.claimsPerDay) {
          throw new ApiError("rate_limited", {
            detail: `You can claim up to ${CONTACT_LIMITS.claimsPerDay} listings a day`,
            hint: "Try again tomorrow. Running more salons than that? Contact support@salonstaff.com.au.",
          });
        }
        // Each claim by link emails the business: not more often than every few minutes.
        const [recent] = await tx
          .select({ id: salonClaims.id })
          .from(salonClaims)
          .where(
            and(
              eq(salonClaims.salonId, salon.id),
              eq(salonClaims.userId, input.userId),
              eq(salonClaims.status, "pending_email"),
              gt(salonClaims.createdAt, new Date(Date.now() - CLAIM_RESEND_MINUTES * 60_000)),
            ),
          )
          .limit(1);
        if (recent && input.method === "email" && salon.email) {
          throw new ApiError("rate_limited", {
            detail: "We've just emailed a confirmation link for this listing",
            hint: `Check the business's inbox (and spam folder), or try again in ${CLAIM_RESEND_MINUTES} minutes.`,
          });
        }
        // A new claim replaces the person's earlier open one for this listing.
        await tx
          .delete(salonClaims)
          .where(
            and(
              eq(salonClaims.salonId, salon.id),
              eq(salonClaims.userId, input.userId),
              inArray(salonClaims.status, OPEN),
            ),
          );
        const viaEmail = input.method === "email" && Boolean(salon.email);
        const token = viaEmail ? randomToken(24) : null;
        const [row] = await tx
          .insert(salonClaims)
          .values({
            salonId: salon.id,
            userId: input.userId,
            abn,
            abnEntityName: input.abr.status === "verified" ? input.abr.entityName : null,
            contactName: input.contactName,
            phone: input.phone,
            status: viaEmail ? "pending_email" : "pending_review",
            tokenHash: token ? await sha256Hex(token) : null,
            tokenExpiresAt: token ? new Date(Date.now() + CLAIM_LINK_HOURS * 3600_000) : null,
          })
          .returning();
        const claim = row as Claim;
        await recordAudit(tx, actor, {
          action: "claim.started",
          targetType: "claim",
          targetId: claim.id,
          after: { salonId: salon.id, status: claim.status },
        });
        return { claim, salon, token };
      });
    },

    /** The claimant opened the emailed link. Must be signed in as the person who started it. */
    async confirm(token: string, userId: string, actor: Actor): Promise<ClaimDecision> {
      const [claim] = await db
        .select()
        .from(salonClaims)
        .where(
          and(
            eq(salonClaims.tokenHash, await sha256Hex(token)),
            eq(salonClaims.status, "pending_email"),
            gt(salonClaims.tokenExpiresAt, new Date()),
          ),
        );
      if (!claim) {
        throw new ApiError("link_expired", {
          detail: "This link is invalid or has expired",
          hint: "Start the claim again from the salon's page.",
        });
      }
      if (claim.userId !== userId) {
        throw new ApiError("forbidden", {
          detail: "This claim was started by another account",
          hint: "Sign in with the account that started the claim, then open the link again.",
        });
      }
      return this.approve(claim.id, "email-link", undefined, actor);
    },

    /** The claimant can't reach the listing's email: staff review it instead. */
    async requestReview(claimId: string, userId: string, actor: Actor): Promise<Claim> {
      return db.transaction(async (tx) => {
        const [claim] = await tx
          .select()
          .from(salonClaims)
          .where(and(eq(salonClaims.id, claimId), eq(salonClaims.userId, userId)))
          .for("update");
        if (!claim) {
          throw new ApiError("not_found", {
            detail: "You have no claim with that ID",
            hint: "See your claim on a listing with GET /v1/salons/{id}/claims/mine.",
          });
        }
        if (claim.status === "pending_review") return claim;
        if (claim.status !== "pending_email") {
          throw new ApiError("conflict", {
            detail: "This claim has already been decided",
            hint: "Start a new claim from the salon's page if you need to.",
          });
        }
        const [row] = await tx
          .update(salonClaims)
          .set({ status: "pending_review", tokenHash: null, tokenExpiresAt: null })
          .where(eq(salonClaims.id, claimId))
          .returning();
        await recordAudit(tx, actor, {
          action: "claim.review_requested",
          targetType: "claim",
          targetId: claimId,
          before: { status: claim.status },
          after: { status: "pending_review" },
        });
        return row as Claim;
      });
    },

    /**
     * Approves a claim: the claimant becomes an owner of the listing (and an employer). On a
     * listing nobody had claimed, it also gets the free period and, if any are left, founding
     * pricing, and other open claims on it are rejected. On one that already had owners, they're
     * returned to be told. `decidedBy` is the staff member's ID, or `email-link`.
     */
    async approve(
      claimId: string,
      decidedBy: string,
      note?: string | undefined,
      actor: Actor = actorFor(decidedBy),
    ): Promise<ClaimDecision> {
      return db.transaction(async (tx) => {
        const [claim] = await tx
          .select()
          .from(salonClaims)
          .where(eq(salonClaims.id, claimId))
          .for("update");
        if (!claim) {
          throw new ApiError("not_found", {
            detail: "No claim with that ID",
            hint: "Pick a claim from the open claims.",
          });
        }
        if (!OPEN.includes(claim.status)) {
          throw new ApiError("conflict", {
            detail: "This claim has already been decided",
            hint: "Reload the open claims: someone may have decided it already.",
          });
        }
        const [salon] = await tx
          .select()
          .from(salons)
          .where(eq(salons.id, claim.salonId))
          .for("update");
        if (!salon) {
          throw new ApiError("not_found", {
            detail: "The listing no longer exists",
            hint: "Reject the claim instead.",
          });
        }
        const first = !(await hasOwners(tx, salon.id));
        const otherOwners = first ? [] : await ownerContacts(tx, salon.id, claim.userId);
        const now = new Date();
        // Joining a salon that's run already leaves its details and terms as its owners set them.
        const [updated] = first
          ? await tx
              .update(salons)
              .set({
                claimedAt: now,
                abn: claim.abn,
                abnStatus: claim.abnEntityName ? "verified" : "pending",
                abnEntityName: claim.abnEntityName,
                contactName: claim.contactName,
                phone: salon.phone ?? claim.phone,
                ...(await launchTerms(tx, {
                  abn: claim.abn,
                  abnVerified: Boolean(claim.abnEntityName),
                  founding: salon.founding,
                  freeUntil: salon.freeUntil,
                })),
              })
              .where(eq(salons.id, salon.id))
              .returning()
          : [salon];
        const [decided] = await tx
          .update(salonClaims)
          .set({
            status: "approved",
            decidedBy,
            decisionNote: note?.trim() || null,
            decidedAt: now,
            tokenHash: null,
          })
          .where(eq(salonClaims.id, claim.id))
          .returning();
        const others = !first
          ? []
          : await tx
              .update(salonClaims)
              .set({
                status: "rejected",
                decidedBy,
                decisionNote: "Claimed by another account",
                decidedAt: now,
                tokenHash: null,
              })
              .where(
                and(
                  eq(salonClaims.salonId, salon.id),
                  ne(salonClaims.id, claim.id),
                  inArray(salonClaims.status, OPEN),
                ),
              )
              .returning({ id: salonClaims.id });
        await addMember(tx, salon.id, claim.userId, "owner", actor);
        await makeEmployer(tx, claim.userId, actor);
        await recordAudit(tx, actor, {
          action: "claim.approved",
          targetType: "claim",
          targetId: claim.id,
          before: { status: claim.status },
          after: { status: "approved", salonId: salon.id, closedOthers: others.length },
          reason: note,
        });
        await recordAudit(tx, actor, {
          action: "salon.claimed",
          targetType: "salon",
          targetId: salon.id,
          after: { ownerId: claim.userId, joinedOwners: !first },
        });
        return {
          claim: decided as Claim,
          salon: updated as Salon,
          contact: await contactOf(tx, claim.userId),
          otherOwners,
        };
      });
    },

    async reject(
      claimId: string,
      decidedBy: string,
      note?: string | undefined,
      actor: Actor = actorFor(decidedBy),
    ): Promise<ClaimDecision> {
      return db.transaction(async (tx) => {
        const [claim] = await tx
          .select()
          .from(salonClaims)
          .where(eq(salonClaims.id, claimId))
          .for("update");
        if (!claim) {
          throw new ApiError("not_found", {
            detail: "No claim with that ID",
            hint: "Pick a claim from the open claims.",
          });
        }
        if (!OPEN.includes(claim.status)) {
          throw new ApiError("conflict", {
            detail: "This claim has already been decided",
            hint: "Reload the open claims: someone may have decided it already.",
          });
        }
        const [decided] = await tx
          .update(salonClaims)
          .set({
            status: "rejected",
            decidedBy,
            decisionNote: note?.trim() || null,
            decidedAt: new Date(),
            tokenHash: null,
            tokenExpiresAt: null,
          })
          .where(eq(salonClaims.id, claimId))
          .returning();
        await recordAudit(tx, actor, {
          action: "claim.rejected",
          targetType: "claim",
          targetId: claimId,
          before: { status: claim.status },
          after: { status: "rejected" },
          reason: note,
        });
        const [salon] = await tx.select().from(salons).where(eq(salons.id, claim.salonId));
        return {
          claim: decided as Claim,
          salon: salon as Salon,
          contact: await contactOf(tx, claim.userId),
          otherOwners: [],
        };
      });
    },
  };
}
