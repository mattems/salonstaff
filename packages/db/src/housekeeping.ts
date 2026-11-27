/**
 * The daily clean-up, run only by the API's cron (`apps/api/src/lib/housekeeping.ts`).
 * It works across every person and salon, so nothing else may call it.
 */
import { lt } from "drizzle-orm";
import { checks } from "./checks";
import { codeLimits } from "./code-limits";
import type { Db } from "./index";
import { idempotencyKeys, salonInvites, sessions, verifications } from "./schema";

/** How long a check may wait for staff before its evidence is deleted anyway (D-03). */
export const EVIDENCE_RETENTION_DAYS = 30;

export function housekeeping(db: Db) {
  return {
    /** Closes checks nobody reviewed in time. Returns the PRIVATE bucket keys to delete. */
    purgeStaleEvidence: (days = EVIDENCE_RETENTION_DAYS) => checks(db).purgeStale(days),

    /** Counts of sign-in codes sent, once they're too old to matter. */
    dropOldCodeRequests: () => codeLimits(db).dropOld(),

    /**
     * What has expired and is only clutter (and old codes and tokens are better gone): sign-in
     * codes, sessions and team invites past their time.
     */
    async dropExpired(): Promise<{ codes: number; sessions: number; invites: number }> {
      const now = new Date();
      const [codes, ended, invites] = await Promise.all([
        db.delete(verifications).where(lt(verifications.expiresAt, now)).returning({
          id: verifications.id,
        }),
        db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
        db.delete(salonInvites).where(lt(salonInvites.expiresAt, now)).returning({
          id: salonInvites.id,
        }),
      ]);
      return { codes: codes.length, sessions: ended.length, invites: invites.length };
    },

    /** Stored answers for idempotent retries last a day. */
    async dropExpiredIdempotencyKeys(): Promise<number> {
      const rows = await db
        .delete(idempotencyKeys)
        .where(lt(idempotencyKeys.expiresAt, new Date()))
        .returning({ key: idempotencyKeys.key });
      return rows.length;
    },
  };
}
