/**
 * Phones that get push notifications (D-15). A device belongs to one signed-in session: the app
 * registers it, and it goes when the session does (signing out, signing out elsewhere, expiry).
 */
import { uuidv7 } from "@salonstaff/shared";
import { and, eq, ne } from "drizzle-orm";
import { type Actor, recordAudit } from "./audit";
import type { Db } from "./index";
import { pushDevices } from "./schema";

export interface PushDevice {
  token: string;
  sandbox: boolean;
}

/** One person's phones, for their own session's device. */
export function myPushDevice(db: Db, userId: string, sessionId: string) {
  return {
    /**
     * Records this session's phone (again on every launch: tokens can change). A token another
     * session had moves to this one: it's the same phone, now signed in here.
     */
    async register(device: PushDevice & { platform: "ios" }, actor: Actor): Promise<void> {
      await db.transaction(async (tx) => {
        await tx
          .delete(pushDevices)
          .where(and(eq(pushDevices.token, device.token), ne(pushDevices.sessionId, sessionId)));
        const [before] = await tx
          .select({ token: pushDevices.token })
          .from(pushDevices)
          .where(eq(pushDevices.sessionId, sessionId));
        if (before) {
          await tx
            .update(pushDevices)
            .set({ token: device.token, sandbox: device.sandbox, updatedAt: new Date() })
            .where(eq(pushDevices.sessionId, sessionId));
        } else {
          await tx.insert(pushDevices).values({
            id: uuidv7(),
            sessionId,
            userId,
            platform: device.platform,
            token: device.token,
            sandbox: device.sandbox,
          });
        }
        if (before?.token !== device.token) {
          await recordAudit(tx, actor, {
            action: "push.device_registered",
            targetType: "user",
            targetId: userId,
            after: { platform: device.platform, sandbox: device.sandbox },
          });
        }
      });
    },

    /** Stops pushes to this session's phone (notifications turned off). True if there was one. */
    async remove(actor: Actor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const removed = await tx
          .delete(pushDevices)
          .where(and(eq(pushDevices.sessionId, sessionId), eq(pushDevices.userId, userId)))
          .returning({ id: pushDevices.id });
        if (!removed.length) return false;
        await recordAudit(tx, actor, {
          action: "push.device_removed",
          targetType: "user",
          targetId: userId,
        });
        return true;
      });
    },
  };
}

/** Where to send someone's pushes, for the notices the API sends. */
export function pushDevicesOf(db: Db) {
  return {
    async forUser(userId: string): Promise<PushDevice[]> {
      return db
        .select({ token: pushDevices.token, sandbox: pushDevices.sandbox })
        .from(pushDevices)
        .where(eq(pushDevices.userId, userId));
    },

    /** Apple said the token is no longer valid (the app was deleted, or notifications turned off). */
    async forget(token: string): Promise<void> {
      await db.delete(pushDevices).where(eq(pushDevices.token, token));
    },
  };
}
