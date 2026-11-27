import { housekeeping as cleanUp, type Db } from "@salonstaff/db";
import type { Env } from "../env";
import { cleanStoredPhotos, deleteUploads } from "./storage";

/**
 * Runs once a day (wrangler.jsonc `triggers`). The verification data rule: evidence for checks
 * nobody reviewed within 30 days is deleted (docs/decisions/D-03-verification-data.md).
 */
export async function housekeeping(db: Db, env: Env): Promise<void> {
  const work = cleanUp(db);
  const { purged, evidenceKeys } = await work.purgeStaleEvidence();
  await deleteUploads(env, "private", evidenceKeys);
  const idempotencyKeys = await work.dropExpiredIdempotencyKeys();
  const codeRequests = await work.dropOldCodeRequests();
  const expired = await work.dropExpired();
  const photosCleaned = await cleanStoredPhotos(env);
  console.log(
    JSON.stringify({
      level: "info",
      event: "housekeeping",
      checks_expired: purged,
      files_deleted: evidenceKeys.length,
      idempotency_keys_dropped: idempotencyKeys,
      code_requests_dropped: codeRequests,
      codes_expired: expired.codes,
      sessions_expired: expired.sessions,
      invites_expired: expired.invites,
      photos_cleaned: photosCleaned,
    }),
  );
}
