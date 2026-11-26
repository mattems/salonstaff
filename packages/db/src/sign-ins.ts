/**
 * How one signed-in person gets in: where they're signed in (sessions) and the Google or Apple
 * accounts connected to theirs. Everything here is scoped to `userId`. Better Auth creates these
 * rows; this scope lists them, ends sessions, disconnects providers and audits it.
 */
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { type Actor, recordAudit } from "./audit";
import type { Db } from "./index";
import { accounts, sessions } from "./schema";

/** The other ways in, besides an email or SMS code (packages/auth's SOCIAL_PROVIDERS). */
const PROVIDERS = ["google", "apple"];

export interface SignInSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  /** The library touches a session at most once a day as it's used. */
  updatedAt: Date;
  expiresAt: Date;
}

export interface ConnectedProvider {
  provider: string;
  connectedAt: Date;
}

export function signIns(db: Db, userId: string) {
  return {
    /** Sessions that haven't expired, most recently used first. */
    async sessions(): Promise<SignInSession[]> {
      return db
        .select({
          id: sessions.id,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
          createdAt: sessions.createdAt,
          updatedAt: sessions.updatedAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
        .orderBy(desc(sessions.updatedAt), desc(sessions.createdAt));
    },

    /** Signs out one device. False when it isn't one of theirs. */
    async endSession(sessionId: string, actor: Actor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [ended] = await tx
          .delete(sessions)
          .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
          .returning({ id: sessions.id });
        if (!ended) return false;
        await recordAudit(tx, actor, {
          action: "auth.signed_out_device",
          targetType: "user",
          targetId: userId,
        });
        return true;
      });
    },

    /** Signs out every device but the one asking. Returns how many. */
    async endOtherSessions(currentSessionId: string, actor: Actor): Promise<number> {
      return db.transaction(async (tx) => {
        const ended = await tx
          .delete(sessions)
          .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)))
          .returning({ id: sessions.id });
        if (ended.length > 0) {
          await recordAudit(tx, actor, {
            action: "auth.signed_out_elsewhere",
            targetType: "user",
            targetId: userId,
            after: { sessions: ended.length },
          });
        }
        return ended.length;
      });
    },

    /** Google and Apple accounts connected to this one. */
    async providers(): Promise<ConnectedProvider[]> {
      const rows = await db
        .select({ provider: accounts.providerId, connectedAt: accounts.createdAt })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), inArray(accounts.providerId, PROVIDERS)));
      return rows;
    },

    /** Disconnects Google or Apple. False when it wasn't connected. */
    async disconnect(provider: string, actor: Actor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const removed = await tx
          .delete(accounts)
          .where(and(eq(accounts.userId, userId), eq(accounts.providerId, provider)))
          .returning({ id: accounts.id });
        if (removed.length === 0) return false;
        await recordAudit(tx, actor, {
          action: "auth.provider_disconnected",
          targetType: "user",
          targetId: userId,
          before: { provider },
        });
        return true;
      });
    },

    /**
     * Audits a changed email. Better Auth makes the change (it checks the code from the new
     * address), so this follows it rather than sharing its transaction.
     */
    async recordEmailChange(before: string | null, after: string, actor: Actor): Promise<void> {
      await recordAudit(db, actor, {
        action: "user.email_changed",
        targetType: "user",
        targetId: userId,
        before: { email: before },
        after: { email: after },
      });
    },
  };
}
