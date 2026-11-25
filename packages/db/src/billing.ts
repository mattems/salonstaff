/**
 * Payments across salons, for the Stripe webhook and the local mock checkout. A salon's own view
 * of its billing is in `salonScope`.
 */
import { and, eq, sql } from "drizzle-orm";
import { type Actor, recordAudit } from "./audit";
import type { Db } from "./index";
import type { Payment } from "./salon";
import { payments, salons } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export function billing(db: Db) {
  return {
    async paymentByRef(checkoutRef: string): Promise<Payment | null> {
      const [row] = await db.select().from(payments).where(eq(payments.checkoutRef, checkoutRef));
      return row ?? null;
    },

    /**
     * Marks a checkout paid and grants what was bought: a listing credit, or the Salon Plan.
     * Safe to call more than once (Stripe retries webhooks): only a pending payment is fulfilled.
     */
    async fulfil(
      checkoutRef: string,
      extra: { subscriptionId?: string | null | undefined; periodEnd?: Date | undefined } = {},
      actor: Actor = { type: "system" },
    ): Promise<Payment | null> {
      return db.transaction(async (tx) => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.checkoutRef, checkoutRef))
          .for("update");
        if (payment?.status !== "pending") return null;
        await tx.update(payments).set({ status: "paid" }).where(eq(payments.id, payment.id));
        if (payment.kind === "single_listing") {
          await tx
            .update(salons)
            .set({ listingCredits: sql`${salons.listingCredits} + 1` })
            .where(eq(salons.id, payment.salonId));
        } else {
          await tx
            .update(salons)
            .set({
              subscriptionStatus: "active",
              stripeSubscriptionId: extra.subscriptionId ?? null,
              subscriptionCurrentPeriodEnd: extra.periodEnd ?? new Date(Date.now() + 31 * DAY_MS),
            })
            .where(eq(salons.id, payment.salonId));
        }
        await recordAudit(tx, actor, {
          action: "payment.paid",
          targetType: "payment",
          targetId: payment.id,
          after: { kind: payment.kind, amountCents: payment.amountCents, salonId: payment.salonId },
        });
        return { ...payment, status: "paid" as const };
      });
    },

    /** The checkout was abandoned or failed. */
    async fail(checkoutRef: string, actor: Actor = { type: "system" }): Promise<Payment | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(payments)
          .set({ status: "failed" })
          .where(and(eq(payments.checkoutRef, checkoutRef), eq(payments.status, "pending")))
          .returning();
        if (row) {
          await recordAudit(tx, actor, {
            action: "payment.failed",
            targetType: "payment",
            targetId: row.id,
          });
        }
        return row ?? null;
      });
    },

    /** Keeps a salon's plan in step with its Stripe subscription. */
    async syncSubscription(
      subscriptionId: string,
      status: string,
      periodEnd: Date | null,
      actor: Actor = { type: "system" },
    ): Promise<void> {
      await db.transaction(async (tx) => {
        const changed = await tx
          .update(salons)
          .set({ subscriptionStatus: status, subscriptionCurrentPeriodEnd: periodEnd })
          .where(eq(salons.stripeSubscriptionId, subscriptionId))
          .returning({ id: salons.id });
        for (const { id } of changed) {
          await recordAudit(tx, actor, {
            action: "salon.subscription_changed",
            targetType: "salon",
            targetId: id,
            after: { status },
          });
        }
      });
    },
  };
}
