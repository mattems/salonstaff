/**
 * The daily clean-up, run only by the API's cron (`apps/api/src/lib/housekeeping.ts`).
 * It works across every person and salon, so nothing else may call it.
 */
import { lt } from "drizzle-orm";
import { checks } from "./checks";
import type { Db } from "./index";
import { idempotencyKeys } from "./schema";

/** How long a check may wait for staff before its evidence is deleted anyway (D-03). */
export const EVIDENCE_RETENTION_DAYS = 30;

export function housekeeping(db: Db) {
  return {
    /** Closes checks nobody reviewed in time. Returns the PRIVATE bucket keys to delete. */
    purgeStaleEvidence: (days = EVIDENCE_RETENTION_DAYS) => checks(db).purgeStale(days),

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
