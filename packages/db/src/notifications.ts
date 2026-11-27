/**
 * What one person chose to hear about (D-15): push and email for each topic. Everything is on
 * until they switch it off; only their choices are stored.
 */
import {
  NOTIFICATION_TOPIC_VALUES,
  type NotificationPreferences,
  type NotificationTopic,
} from "@salonstaff/shared";
import { eq, sql } from "drizzle-orm";
import { type Actor, recordAudit } from "./audit";
import type { Db } from "./index";
import { notificationPreferences } from "./schema";

const allOn = (): NotificationPreferences => ({
  messages: { push: true, email: true },
  applications: { push: true, email: true },
  account: { push: true, email: true },
});

export function notificationSettings(db: Db, userId: string) {
  return {
    async get(): Promise<NotificationPreferences> {
      const prefs = allOn();
      const rows = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));
      for (const row of rows) {
        if (row.topic in prefs) prefs[row.topic] = { push: row.push, email: row.email };
      }
      return prefs;
    },

    /** Whether to send this topic by this channel. */
    async allows(topic: NotificationTopic, channel: "push" | "email"): Promise<boolean> {
      return (await this.get())[topic][channel];
    },

    async save(input: NotificationPreferences, actor: Actor): Promise<NotificationPreferences> {
      await db.transaction(async (tx) => {
        for (const topic of NOTIFICATION_TOPIC_VALUES) {
          const { push, email } = input[topic];
          await tx
            .insert(notificationPreferences)
            .values({ userId, topic, push, email })
            .onConflictDoUpdate({
              target: [notificationPreferences.userId, notificationPreferences.topic],
              set: { push, email, updatedAt: sql`now()` },
            });
        }
        await recordAudit(tx, actor, {
          action: "notifications.preferences_changed",
          targetType: "user",
          targetId: userId,
          after: input,
        });
      });
      return this.get();
    },
  };
}
