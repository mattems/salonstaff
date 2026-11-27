/**
 * How many sign-in codes one email or mobile may be sent (`LIMITS.otpRequestsPerHour`,
 * `otpRequestsPerDay`), counted per destination rather than per caller: without it, someone
 * changing IP addresses could text or email one person without end, or keep asking for fresh
 * codes to guess at.
 */
import { LIMITS, sha256Hex } from "@salonstaff/shared";
import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import type { Executor } from "./audit";
import { codeRequests } from "./schema";

const HOUR_MS = 60 * 60 * 1000;

export function codeLimits(db: Executor) {
  return {
    /**
     * Counts a code about to be sent to `destination` (an email or a mobile). False when it has
     * had its share for the hour or the day: send nothing. Other things sent to a destination
     * are counted the same way under a prefixed name (`sms-notice:+614…`) with their own limits.
     */
    async allow(
      destination: string,
      limits: { perHour: number; perDay: number } = {
        perHour: LIMITS.otpRequestsPerHour,
        perDay: LIMITS.otpRequestsPerDay,
      },
    ): Promise<boolean> {
      const destinationHash = await sha256Hex(destination.trim().toLowerCase());
      // Counted and recorded one at a time per destination, so requests sent together can't all
      // see the old count (a once-only use, `perDay: 1`, really is once).
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${destinationHash}))`);
        const since = (ms: number) =>
          tx
            .select({ n: count() })
            .from(codeRequests)
            .where(
              and(
                eq(codeRequests.destinationHash, destinationHash),
                gt(codeRequests.createdAt, new Date(Date.now() - ms)),
              ),
            )
            .then(([row]) => row?.n ?? 0);
        const hour = await since(HOUR_MS);
        const day = await since(24 * HOUR_MS);
        if (hour >= limits.perHour || day >= limits.perDay) return false;
        await tx.insert(codeRequests).values({ destinationHash });
        return true;
      });
    },

    /** The cron: counts older than two days no longer matter. */
    async dropOld(): Promise<number> {
      const rows = await db
        .delete(codeRequests)
        .where(lt(codeRequests.createdAt, new Date(Date.now() - 48 * HOUR_MS)))
        .returning({ id: codeRequests.id });
      return rows.length;
    },
  };
}
