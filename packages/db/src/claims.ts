/**
 * Claiming a directory listing (D-04). ABNs are public, so a claim needs a matching ABN *and*
 * proof of control: a link sent to the listing's business email (48 hours, single use), or
 * staff approval. An approved claim makes the claimant an owner (D-11): any account can claim any
 * number of listings, including ones that already have owners (who are told). A listing's first
 * claim gets the same launch terms as a new salon.
 */
import {
  ApiError,
  CLAIM_CODE_ATTEMPTS,
  CONTACT_LIMITS,
  callableNumber,
  isValidAbn,
  normaliseAuLandline,
  normaliseAuMobile,
  randomDigits,
  randomToken,
  sha256Hex,
  uuidv7,
  withinCallingHours,
} from "@salonstaff/shared";
import { and, count, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import type { Db } from "./index";
import { type AbnCheck, type Contact, launchTerms, makeEmployer } from "./salon";
import {
  type ClaimProof,
  type ClaimStatus,
  salonClaims,
  salonMembers,
  salons,
  users,
} from "./schema";
import { addMember, ownerContacts } from "./team";
import { type Salon, visibleSalon } from "./visibility";

export type Claim = typeof salonClaims.$inferSelect;

export const CLAIM_LINK_HOURS = 48;
/** A claim link is sent again to the same listing for the same person at most this often. */
export const CLAIM_RESEND_MINUTES = 5;
const OPEN: ClaimStatus[] = ["pending_email", "pending_review"];
/** The note on a claim its claimant replaced by starting again. */
const STARTED_AGAIN = "Started again";
/** The six-digit code sent with a claim's proof is stored only as this hash. */
const codeHashOf = (claimId: string, code: string) => sha256Hex(`claim:${claimId}:${code}`);

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
     * by the caller. With `method: "email"` and a listing email, or `method: "phone"` and a
     * listing mobile, returns a six-digit `code` for the caller to send there (and, by email,
     * the one-time `token` for a link); only their hashes are stored. Starting again replaces the
     * person's open claim on the listing with a new code, and counts towards the day's claims.
     */
    async start(
      input: {
        salonId: string;
        userId: string;
        /**
         * The business's ABN. Optional when a code proves the claim (D-22); when given, it must
         * match the listing's (or be active on the ABR). A staff check needs one.
         */
        abn: string | null;
        contactName: string;
        phone: string;
        method: "email" | "phone" | "call" | "review";
        /** The register's answer for `abn`; null without one. */
        abr: AbnCheck | null;
        /**
         * Twilio Verify makes, sends and checks a mobile or landline code (D-23): no code is
         * made or stored here, and it lasts `serviceCodeMinutes`.
         */
        codeByService?: { minutes: number } | undefined;
      },
      actor: Actor,
    ): Promise<{
      claim: Claim;
      salon: Salon;
      token: string | null;
      code: string | null;
      /** Where to send the code: the listing's own email or mobile (E.164). */
      sendTo: { via: ClaimProof; address: string } | null;
    }> {
      const abn = input.abn?.replace(/\s+/g, "") || null;
      if (abn && !isValidAbn(abn)) {
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
        if (abn && salon.abn && salon.abn !== abn) {
          throw new ApiError("conflict", {
            detail: "That ABN doesn't match the one we have for this business",
            hint: "Check the ABN. If the business's ABN has changed, contact support@salonstaff.com.au.",
            errors: [{ path: "abn", message: "Doesn't match the listing" }],
          });
        }
        if (abn && input.abr?.status === "failed") {
          throw new ApiError("validation_failed", {
            detail: "That ABN isn't active on the Australian Business Register",
            hint: "Check it at abr.business.gov.au. A claim needs the business's current ABN.",
            errors: [{ path: "abn", message: "Not active" }],
          });
        }
        // Without a code, staff have only the ABN to go on.
        const viaCode =
          (input.method === "email" && salon.email) ||
          ((input.method === "phone" || input.method === "call") && salon.phone);
        if (!abn && !viaCode) {
          throw new ApiError("validation_failed", {
            detail: "A staff check needs the business's ABN",
            hint: "Add the ABN, or prove it's yours with a code to the listing's email or phone.",
            errors: [{ path: "abn", message: "Needed for a staff check" }],
          });
        }
        const mobile = salon.phone ? normaliseAuMobile(salon.phone) : null;
        const landline = callableNumber(salon.phone);
        if (input.method === "phone" && !mobile) {
          throw new ApiError("validation_failed", {
            detail: "This listing has no mobile number to text a code to",
            hint: "Use the listing's email, or ask Salon Staff to check (`method: review`).",
            errors: [{ path: "method", message: "No mobile on the listing" }],
          });
        }
        if (input.method === "call" && !landline) {
          throw new ApiError("validation_failed", {
            detail: "This listing has no phone number we can call with a code",
            hint: "Use the listing's email or mobile, or ask Salon Staff to check (`method: review`).",
            errors: [{ path: "method", message: "No landline on the listing" }],
          });
        }
        if (input.method === "call" && !withinCallingHours(salon.state, new Date())) {
          throw new ApiError("validation_failed", {
            detail: "We only call salons between 8am and 8pm, their time",
            hint: "Try again then, or use the listing's email or another way.",
            errors: [{ path: "method", message: "Outside calling hours" }],
          });
        }
        // And one account can start only so many a day, across every listing (starting again counts).
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
            detail: `You can start up to ${CONTACT_LIMITS.claimsPerDay} claims a day`,
            hint: "Try again tomorrow. Running more salons than that? Contact support@salonstaff.com.au.",
          });
        }
        const sendTo: { via: ClaimProof; address: string } | null =
          input.method === "email" && salon.email
            ? { via: "email", address: salon.email }
            : input.method === "phone" && mobile
              ? { via: "phone", address: mobile }
              : input.method === "call" && landline
                ? { via: "call", address: landline }
                : null;
        // Each claim by code writes to the business: not more often than every few minutes.
        const [recent] = sendTo
          ? await tx
              .select({ id: salonClaims.id })
              .from(salonClaims)
              .where(
                and(
                  eq(salonClaims.salonId, salon.id),
                  eq(salonClaims.userId, input.userId),
                  eq(salonClaims.verifyVia, sendTo.via),
                  gt(salonClaims.createdAt, new Date(Date.now() - CLAIM_RESEND_MINUTES * 60_000)),
                  or(
                    eq(salonClaims.status, "pending_email"),
                    eq(salonClaims.decisionNote, STARTED_AGAIN),
                  ),
                ),
              )
              .limit(1)
          : [];
        if (recent && sendTo) {
          throw new ApiError("rate_limited", {
            detail:
              sendTo.via === "email"
                ? "We've just emailed a code for this listing"
                : sendTo.via === "phone"
                  ? "We've just texted a code for this listing"
                  : "We've just called the salon with a code",
            hint: `${sendTo.via === "email" ? "Check the business's inbox (and spam folder)" : sendTo.via === "phone" ? "Check the salon's mobile" : "Wait for the call"}, or try again in ${CLAIM_RESEND_MINUTES} minutes.`,
          });
        }
        // A new claim replaces the person's earlier open one for this listing. It's kept (as
        // replaced), so starting again counts towards the day's claims: each start is a fresh
        // code and fresh guesses.
        await tx
          .update(salonClaims)
          .set({
            status: "rejected",
            decidedBy: "system",
            decisionNote: STARTED_AGAIN,
            decidedAt: new Date(),
            tokenHash: null,
            tokenExpiresAt: null,
            codeHash: null,
          })
          .where(
            and(
              eq(salonClaims.salonId, salon.id),
              eq(salonClaims.userId, input.userId),
              inArray(salonClaims.status, OPEN),
            ),
          );
        const id = uuidv7();
        const token = sendTo?.via === "email" ? randomToken(24) : null;
        const byService = sendTo && sendTo.via !== "email" ? input.codeByService : undefined;
        const code = sendTo && !byService ? randomDigits(6) : null;
        const [row] = await tx
          .insert(salonClaims)
          .values({
            id,
            salonId: salon.id,
            userId: input.userId,
            abn,
            abnEntityName: abn && input.abr?.status === "verified" ? input.abr.entityName : null,
            contactName: input.contactName,
            phone: input.phone,
            status: sendTo ? "pending_email" : "pending_review",
            verifyVia: sendTo?.via ?? null,
            tokenHash: token ? await sha256Hex(token) : null,
            codeHash: code ? await codeHashOf(id, code) : null,
            codeService: byService ? "twilio_verify" : null,
            tokenExpiresAt: byService
              ? new Date(Date.now() + byService.minutes * 60_000)
              : sendTo
                ? new Date(Date.now() + CLAIM_LINK_HOURS * 3600_000)
                : null,
          })
          .returning();
        const claim = row as Claim;
        await recordAudit(tx, actor, {
          action: "claim.started",
          targetType: "claim",
          targetId: claim.id,
          after: { salonId: salon.id, status: claim.status, via: claim.verifyVia },
        });
        return { claim, salon, token, code, sendTo };
      });
    },

    /**
     * The claimant typed the code sent to the listing's email or mobile. Only the account that
     * started the claim can; after `CLAIM_CODE_ATTEMPTS` wrong codes it takes no more.
     */
    async confirmCode(
      claimId: string,
      userId: string,
      code: string,
      actor: Actor,
      /** Asks Twilio Verify whether `code` is the one it sent to `to` (D-23). */
      checkWithService?: (to: string, code: string) => Promise<boolean>,
    ): Promise<ClaimDecision> {
      const [claim] = await db
        .select()
        .from(salonClaims)
        .where(and(eq(salonClaims.id, claimId), eq(salonClaims.userId, userId)));
      if (!claim) {
        throw new ApiError("not_found", {
          detail: "You have no claim with that ID",
          hint: "See your claim on a listing with GET /v1/salons/{id}/claims/mine.",
        });
      }
      if (claim.status !== "pending_email" || (!claim.codeHash && !claim.codeService)) {
        throw new ApiError("conflict", {
          detail:
            claim.status === "pending_review"
              ? "Salon Staff is checking this claim"
              : "This claim isn't waiting for a code",
          hint: "See where it stands with GET /v1/salons/{id}/claims/mine.",
        });
      }
      if (!claim.tokenExpiresAt || claim.tokenExpiresAt <= new Date()) {
        throw new ApiError("link_expired", {
          detail: "This code has expired",
          hint: "Start the claim again to get a new code.",
        });
      }
      const tooMany = () =>
        new ApiError("rate_limited", {
          detail: "Too many wrong codes",
          hint: "Start the claim again for a new code, or ask Salon Staff to check it instead.",
        });
      if (claim.codeAttempts >= CLAIM_CODE_ATTEMPTS) throw tooMany();
      const typed = code.replace(/\D/g, "");
      let right: boolean;
      if (claim.codeService) {
        const [salon] = await db
          .select({ phone: salons.phone })
          .from(salons)
          .where(eq(salons.id, claim.salonId));
        // Where the code went: the mobile (a text or a call) or the landline.
        const to = salon?.phone
          ? (normaliseAuMobile(salon.phone) ?? normaliseAuLandline(salon.phone))
          : null;
        if (!to || !checkWithService) {
          throw new ApiError("upstream_unavailable", {
            detail: "The code can't be checked right now",
            hint: "Try again in a minute, or ask Salon Staff to check it instead.",
          });
        }
        right = await checkWithService(to, typed);
      } else {
        right = (await codeHashOf(claim.id, typed)) === claim.codeHash;
      }
      if (!right) {
        // Counted outside any transaction, so the error below can't undo it.
        const [counted] = await db
          .update(salonClaims)
          .set({ codeAttempts: sql`${salonClaims.codeAttempts} + 1` })
          .where(
            and(eq(salonClaims.id, claim.id), lt(salonClaims.codeAttempts, CLAIM_CODE_ATTEMPTS)),
          )
          .returning({ attempts: salonClaims.codeAttempts });
        if (!counted) throw tooMany();
        const left = CLAIM_CODE_ATTEMPTS - counted.attempts;
        if (left <= 0) throw tooMany();
        throw new ApiError("validation_failed", {
          detail: "That code isn't right",
          hint: `Check the code and try again (${left} more ${left === 1 ? "try" : "tries"}).`,
          errors: [{ path: "code", message: "Not the code we sent" }],
        });
      }
      return this.approve(
        claim.id,
        claim.verifyVia === "phone"
          ? "sms-code"
          : claim.verifyVia === "call"
            ? "call-code"
            : "email-code",
        undefined,
        actor,
      );
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

    /** The code couldn't be sent (Twilio refused): the claim is closed, so they can start again. */
    async sendFailed(claimId: string, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .update(salonClaims)
          .set({
            status: "rejected",
            decidedBy: "system",
            decisionNote: "The code couldn't be sent",
            decidedAt: new Date(),
            tokenHash: null,
            tokenExpiresAt: null,
            codeHash: null,
          })
          .where(and(eq(salonClaims.id, claimId), eq(salonClaims.status, "pending_email")))
          .returning({ id: salonClaims.id });
        if (row) {
          await recordAudit(tx, actor, {
            action: "claim.send_failed",
            targetType: "claim",
            targetId: claimId,
            after: { status: "rejected" },
          });
        }
      });
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
          .set({ status: "pending_review", tokenHash: null, tokenExpiresAt: null, codeHash: null })
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
                // Without an ABN from the claimant, the listing keeps its own (unconfirmed) one;
                // the owner can add or correct it under the salon's details.
                ...(claim.abn
                  ? {
                      abn: claim.abn,
                      abnStatus: claim.abnEntityName ? ("verified" as const) : ("pending" as const),
                      abnEntityName: claim.abnEntityName,
                    }
                  : {}),
                contactName: claim.contactName,
                phone: salon.phone ?? claim.phone,
                ...(await launchTerms(tx, {
                  abn: claim.abn ?? salon.abn,
                  abnVerified: Boolean(claim.abn && claim.abnEntityName),
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
            codeHash: null,
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
                codeHash: null,
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
            codeHash: null,
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
