/**
 * Salon teams (D-11): who manages a salon, as an owner or a manager, and owners' emailed invites.
 * `salonTeam(db, salonId)` is for the salon's own people; `invites(db)` is for whoever opens a link.
 * A salon always keeps at least one owner.
 */
import { ApiError, CONTACT_LIMITS, randomToken, sha256Hex } from "@salonstaff/shared";
import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { type Actor, type Executor, recordAudit } from "./audit";
import { codeLimits } from "./code-limits";
import type { Db } from "./index";
import { type Contact, makeEmployer } from "./salon";
import { type SalonRole, salonInvites, salonMembers, salons, users } from "./schema";
import type { Salon } from "./visibility";

export type { SalonRole };
export type Invite = typeof salonInvites.$inferSelect;

export const INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TeamMember {
  userId: string;
  name: string;
  /** May be a stand-in address (an account made with a mobile number): check with `isStandInEmail`. */
  email: string;
  phoneNumber: string | null;
  role: SalonRole;
  joinedAt: Date;
}

/** Makes someone a member (or changes their role), recording it. */
export async function addMember(
  tx: Executor,
  salonId: string,
  userId: string,
  role: SalonRole,
  actor: Actor,
): Promise<void> {
  const [before] = await tx
    .select({ role: salonMembers.role })
    .from(salonMembers)
    .where(and(eq(salonMembers.salonId, salonId), eq(salonMembers.userId, userId)));
  if (before?.role === role) return;
  await tx
    .insert(salonMembers)
    .values({ salonId, userId, role })
    .onConflictDoUpdate({ target: [salonMembers.salonId, salonMembers.userId], set: { role } });
  await recordAudit(tx, actor, {
    action: before ? "salon.member_role_changed" : "salon.member_added",
    targetType: "salon",
    targetId: salonId,
    before: before ? { userId, role: before.role } : undefined,
    after: { userId, role },
  });
}

/** The salon's owners' contact details (not banned), e.g. to tell them someone else joined. */
export async function ownerContacts(
  tx: Executor,
  salonId: string,
  except?: string,
): Promise<Contact[]> {
  return tx
    .select({ userId: users.id, email: users.email, phoneNumber: users.phoneNumber })
    .from(salonMembers)
    .innerJoin(users, eq(users.id, salonMembers.userId))
    .where(
      and(
        eq(salonMembers.salonId, salonId),
        eq(salonMembers.role, "owner"),
        isNull(users.suspendedAt),
        except ? ne(salonMembers.userId, except) : undefined,
      ),
    );
}

/**
 * Takes a person off every salon, as when their account is deleted. Where they were the last owner,
 * a salon they made is deleted and a claimed listing goes back to being unclaimed, without its team.
 */
export async function releaseSalonsOf(
  tx: Executor,
  userId: string,
  actor: Actor,
  reason: string,
): Promise<{ deleted: Salon[]; unclaimed: Salon[] }> {
  const owned = await tx
    .select({ salon: salons })
    .from(salonMembers)
    .innerJoin(salons, eq(salons.id, salonMembers.salonId))
    .where(and(eq(salonMembers.userId, userId), eq(salonMembers.role, "owner")))
    .for("update", { of: salons });
  const deleted: Salon[] = [];
  const unclaimed: Salon[] = [];
  for (const { salon } of owned) {
    const [another] = await tx
      .select({ userId: salonMembers.userId })
      .from(salonMembers)
      .where(
        and(
          eq(salonMembers.salonId, salon.id),
          eq(salonMembers.role, "owner"),
          ne(salonMembers.userId, userId),
        ),
      )
      .limit(1);
    if (another) continue;
    if (salon.source === "owner") {
      await tx.delete(salons).where(eq(salons.id, salon.id));
      await recordAudit(tx, actor, {
        action: "salon.deleted",
        targetType: "salon",
        targetId: salon.id,
        before: { name: salon.name },
        reason,
      });
      deleted.push(salon);
    } else {
      await unclaimSalon(tx, salon.id);
      await recordAudit(tx, actor, {
        action: "salon.unclaimed",
        targetType: "salon",
        targetId: salon.id,
        reason,
      });
      unclaimed.push(salon);
    }
  }
  await tx.delete(salonMembers).where(eq(salonMembers.userId, userId));
  return { deleted, unclaimed };
}

/** Makes a listing unclaimed: nobody on its team, no invites out. */
export async function unclaimSalon(tx: Executor, salonId: string): Promise<Salon> {
  await tx.delete(salonMembers).where(eq(salonMembers.salonId, salonId));
  await tx.delete(salonInvites).where(eq(salonInvites.salonId, salonId));
  const [row] = await tx
    .update(salons)
    // The next owner mustn't inherit the last one's plan, credits or Stripe customer (its
    // invoices and card). The caller cancels the subscription at Stripe first.
    .set({
      claimedAt: null,
      source: "directory",
      listingCredits: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      subscriptionCurrentPeriodEnd: null,
    })
    .where(eq(salons.id, salonId))
    .returning();
  return row as Salon;
}

const lastOwner = () =>
  new ApiError("conflict", {
    detail: "A salon needs at least one owner",
    hint: "Make someone else an owner first (PATCH /v1/employer/salons/{salonId}/team/{userId}).",
  });

const notOnTeam = () =>
  new ApiError("not_found", {
    detail: "Nobody with that ID is on this salon's team",
    hint: "List the team with GET /v1/employer/salons/{salonId}/team.",
  });

export function salonTeam(db: Db, salonId: string) {
  /** Locks the salon so two changes can't both remove its last owners. */
  const lockSalon = (tx: Executor) =>
    tx.select({ id: salons.id }).from(salons).where(eq(salons.id, salonId)).for("update");

  const ownerCount = async (tx: Executor) => {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(salonMembers)
      .where(and(eq(salonMembers.salonId, salonId), eq(salonMembers.role, "owner")));
    return row?.n ?? 0;
  };

  const memberRole = async (tx: Executor, userId: string) => {
    const [row] = await tx
      .select({ role: salonMembers.role })
      .from(salonMembers)
      .where(and(eq(salonMembers.salonId, salonId), eq(salonMembers.userId, userId)));
    return row?.role ?? null;
  };

  return {
    /** Owners first, then by when they joined. */
    async members(): Promise<TeamMember[]> {
      return db
        .select({
          userId: salonMembers.userId,
          name: users.name,
          email: users.email,
          phoneNumber: users.phoneNumber,
          role: salonMembers.role,
          joinedAt: salonMembers.createdAt,
        })
        .from(salonMembers)
        .innerJoin(users, eq(users.id, salonMembers.userId))
        .where(eq(salonMembers.salonId, salonId))
        .orderBy(sql`${salonMembers.role} = 'owner' desc`, asc(salonMembers.createdAt));
    },

    /** Invites not yet accepted or expired, newest first. */
    async invites(): Promise<Invite[]> {
      return db
        .select()
        .from(salonInvites)
        .where(and(eq(salonInvites.salonId, salonId), gt(salonInvites.expiresAt, sql`now()`)))
        .orderBy(sql`${salonInvites.createdAt} desc`);
    },

    /**
     * Invites someone by email. Replaces an earlier invite to the same address. Returns the
     * one-time `token` for the link the caller emails; only its hash is stored.
     */
    async invite(
      input: { email: string; role: SalonRole; invitedBy: string },
      actor: Actor,
    ): Promise<{ invite: Invite; token: string }> {
      const email = input.email.trim().toLowerCase();
      return db.transaction(async (tx) => {
        const [already] = await tx
          .select({ id: users.id })
          .from(salonMembers)
          .innerJoin(users, eq(users.id, salonMembers.userId))
          .where(and(eq(salonMembers.salonId, salonId), sql`lower(${users.email}) = ${email}`));
        if (already) {
          throw new ApiError("conflict", {
            detail: "Someone with that email is already on the team",
            hint: "Change their role with PATCH /v1/employer/salons/{salonId}/team/{userId}.",
          });
        }
        // Each invite emails someone: a salon gets only so many a day. Counted apart from the
        // invites themselves, which go when they're accepted or cancelled.
        const allowed = await codeLimits(tx).allow(`invite:${salonId}`, {
          perHour: CONTACT_LIMITS.invitesPerDay,
          perDay: CONTACT_LIMITS.invitesPerDay,
        });
        if (!allowed) {
          throw new ApiError("rate_limited", {
            detail: `A salon can invite up to ${CONTACT_LIMITS.invitesPerDay} people a day`,
            hint: "Try again tomorrow.",
          });
        }
        const token = randomToken(24);
        const values = {
          salonId,
          email,
          role: input.role,
          tokenHash: await sha256Hex(token),
          expiresAt: new Date(Date.now() + INVITE_DAYS * DAY_MS),
          invitedBy: input.invitedBy,
        };
        const [row] = await tx
          .insert(salonInvites)
          .values(values)
          .onConflictDoUpdate({
            target: [salonInvites.salonId, salonInvites.email],
            set: { ...values, createdAt: new Date() },
          })
          .returning();
        const invite = row as Invite;
        await recordAudit(tx, actor, {
          action: "salon.invite_sent",
          targetType: "salon",
          targetId: salonId,
          after: { email, role: input.role },
        });
        return { invite, token };
      });
    },

    async cancelInvite(inviteId: string, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .delete(salonInvites)
          .where(and(eq(salonInvites.id, inviteId), eq(salonInvites.salonId, salonId)))
          .returning();
        if (!row) {
          throw new ApiError("not_found", {
            detail: "This salon has no invite with that ID",
            hint: "List pending invites with GET /v1/employer/salons/{salonId}/team.",
          });
        }
        await recordAudit(tx, actor, {
          action: "salon.invite_cancelled",
          targetType: "salon",
          targetId: salonId,
          before: { email: row.email, role: row.role },
        });
      });
    },

    /** Makes a member an owner or a manager. The last owner can't become a manager. */
    async setRole(userId: string, role: SalonRole, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        await lockSalon(tx);
        const before = await memberRole(tx, userId);
        if (!before) throw notOnTeam();
        if (before === "owner" && role === "manager" && (await ownerCount(tx)) <= 1) {
          throw lastOwner();
        }
        await addMember(tx, salonId, userId, role, actor);
      });
    },

    /** Takes someone off the team (or they leave). The last owner can't go. */
    async remove(userId: string, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        await lockSalon(tx);
        const before = await memberRole(tx, userId);
        if (!before) throw notOnTeam();
        if (before === "owner" && (await ownerCount(tx)) <= 1) throw lastOwner();
        await tx
          .delete(salonMembers)
          .where(and(eq(salonMembers.salonId, salonId), eq(salonMembers.userId, userId)));
        await recordAudit(tx, actor, {
          action: "salon.member_removed",
          targetType: "salon",
          targetId: salonId,
          before: { userId, role: before },
        });
      });
    },

    /** Of these people, the ones on the team. */
    async onTeam(userIds: string[]): Promise<string[]> {
      if (userIds.length === 0) return [];
      const rows = await db
        .select({ userId: salonMembers.userId })
        .from(salonMembers)
        .where(and(eq(salonMembers.salonId, salonId), inArray(salonMembers.userId, userIds)));
      return rows.map((r) => r.userId);
    },
  };
}

export type SalonTeam = ReturnType<typeof salonTeam>;

const expiredInvite = () =>
  new ApiError("link_expired", {
    detail: "This invite is invalid or has expired",
    hint: "Ask the salon's owner to invite you again.",
  });

export function invites(db: Db) {
  const findByToken = async (tx: Executor, token: string, lock = false) => {
    const query = tx
      .select({ invite: salonInvites, salon: salons, invitedBy: users.name })
      .from(salonInvites)
      .innerJoin(salons, eq(salons.id, salonInvites.salonId))
      .leftJoin(users, eq(users.id, salonInvites.invitedBy))
      .where(
        and(
          eq(salonInvites.tokenHash, await sha256Hex(token)),
          gt(salonInvites.expiresAt, sql`now()`),
        ),
      );
    const [row] = lock ? await query.for("update", { of: salonInvites }) : await query;
    return row ?? null;
  };

  return {
    /** What an invite link is for, to show before accepting. */
    async preview(token: string) {
      const row = await findByToken(db, token);
      if (!row) throw expiredInvite();
      return row;
    },

    /**
     * Accepts an invite as the signed-in person: they join the team (an existing manager invited as
     * an owner becomes one) and their account becomes an employer account. The link is used up.
     */
    async accept(
      token: string,
      userId: string,
      actor: Actor,
    ): Promise<{ salon: Salon; role: SalonRole }> {
      return db.transaction(async (tx) => {
        const row = await findByToken(tx, token, true);
        if (!row) throw expiredInvite();
        const [current] = await tx
          .select({ role: salonMembers.role })
          .from(salonMembers)
          .where(and(eq(salonMembers.salonId, row.salon.id), eq(salonMembers.userId, userId)));
        // Never a step down: an owner who opens a manager's invite stays an owner.
        const role: SalonRole = current?.role === "owner" ? "owner" : row.invite.role;
        await addMember(tx, row.salon.id, userId, role, actor);
        await makeEmployer(tx, userId, actor);
        await tx.delete(salonInvites).where(eq(salonInvites.id, row.invite.id));
        await recordAudit(tx, actor, {
          action: "salon.invite_accepted",
          targetType: "salon",
          targetId: row.salon.id,
          after: { userId, role, email: row.invite.email },
        });
        return { salon: row.salon, role };
      });
    },
  };
}
