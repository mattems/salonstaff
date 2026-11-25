/**
 * The admin portal's own data: staff, their passkeys, passkey challenges, and the audit log.
 * Taken from kaybee. Only the admin API (behind `requireStaff`) and the staff script use it.
 */
import {
  STAFF_CONFIRMATION_SECONDS,
  type StaffConfirmedAction,
  type StaffRole,
  uuidv7,
} from "@salonstaff/shared";
import { and, desc, eq, gte, ilike, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Actor, type Executor, recordAudit } from "./audit";
import type { Db } from "./index";
import { contains } from "./like";
import { auditLog, staff, staffConfirmations, staffPasskeys, users } from "./schema";

export type Staff = typeof staff.$inferSelect;
export type StaffWithAdder = Staff & { addedByName: string | null; passkeys: number };
export type StaffPasskey = typeof staffPasskeys.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
export interface AuditRowWithNames extends AuditRow {
  actorName: string | null;
}

export class StaffExistsError extends Error {}
export class PasskeyExistsError extends Error {}
/** The change would leave the portal with no owner. */
export class LastOwnerError extends Error {}

/** How often a staff member's "last used the portal" time is refreshed. */
const SEEN_EVERY_MS = 5 * 60 * 1000;

/** Fails unless some other current staff member is an owner. Locks the owners so two changes can't race. */
async function requireAnotherOwner(tx: Executor, memberId: string): Promise<void> {
  const owners = await tx
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.role, "owner"), isNull(staff.removedAt)))
    .for("update");
  if (!owners.some((owner) => owner.id !== memberId)) throw new LastOwnerError();
}

export function staffOffice(db: Db) {
  return {
    staff: {
      /** The staff member Cloudflare Access let in, by email, or null if they aren't (or are no longer) staff. */
      async findActive(email: string): Promise<Staff | null> {
        const [row] = await db
          .select()
          .from(staff)
          .where(and(eq(staff.email, email.trim().toLowerCase()), isNull(staff.removedAt)))
          .limit(1);
        return row ?? null;
      },

      /** A current staff member by ID. */
      async find(id: string): Promise<Staff | null> {
        const [row] = await db
          .select()
          .from(staff)
          .where(and(eq(staff.id, id), isNull(staff.removedAt)))
          .limit(1);
        return row ?? null;
      },

      /** Current staff, in the order they were added. */
      async list(): Promise<StaffWithAdder[]> {
        const adder = alias(staff, "adder");
        const rows = await db
          .select({
            staff,
            addedByName: adder.name,
            passkeys: sql<number>`(select count(*)::int from ${staffPasskeys} where ${staffPasskeys.staffId} = ${staff.id})`,
          })
          .from(staff)
          .leftJoin(adder, eq(adder.id, staff.addedBy))
          .where(isNull(staff.removedAt))
          .orderBy(staff.createdAt, staff.id);
        return rows.map((r) => ({ ...r.staff, addedByName: r.addedByName, passkeys: r.passkeys }));
      },

      /**
       * Adds a staff member. They need no customer account: passing Cloudflare
       * Access with this address is their sign-in. Someone removed earlier is
       * brought back as the same record, so their history stays attached.
       */
      async add(
        input: { name: string; email: string; role: StaffRole; reason?: string | undefined },
        actor: Actor,
      ): Promise<Staff> {
        const email = input.email.trim().toLowerCase();
        return db.transaction(async (tx) => {
          const [existing] = await tx.select().from(staff).where(eq(staff.email, email)).limit(1);
          if (existing && !existing.removedAt) throw new StaffExistsError(email);
          const now = new Date();
          const values = {
            name: input.name.trim(),
            role: input.role,
            addedBy: actor.type === "staff" ? (actor.id ?? null) : null,
            reason: input.reason ?? null,
            removedAt: null,
            lastSeenAt: null,
            createdAt: now,
            updatedAt: now,
          };
          const [row] = existing
            ? await tx.update(staff).set(values).where(eq(staff.id, existing.id)).returning()
            : await tx
                .insert(staff)
                .values({ id: uuidv7(), email, ...values })
                .returning();
          await recordAudit(tx, actor, {
            action: "staff.added",
            targetType: "staff",
            targetId: (row as Staff).id,
            after: { email, role: input.role },
            reason: input.reason,
          });
          return row as Staff;
        });
      },

      /** Changes a staff member's role. Refuses to leave the portal with no owner. */
      async changeRole(
        member: Staff,
        role: StaffRole,
        reason: string | undefined,
        actor: Actor,
      ): Promise<Staff> {
        if (member.role === role) return member;
        return db.transaction(async (tx) => {
          if (member.role === "owner") await requireAnotherOwner(tx, member.id);
          const [row] = await tx
            .update(staff)
            .set({ role, updatedAt: new Date() })
            .where(eq(staff.id, member.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "staff.role_changed",
            targetType: "staff",
            targetId: member.id,
            before: { email: member.email, role: member.role },
            after: { role },
            reason,
          });
          return row as Staff;
        });
      },

      /**
       * Ends a staff member's access from their next request. The record is
       * kept, so what they did is still named in the audit log.
       */
      async remove(member: Staff, reason: string | undefined, actor: Actor): Promise<void> {
        await db.transaction(async (tx) => {
          if (member.role === "owner") await requireAnotherOwner(tx, member.id);
          const now = new Date();
          await tx
            .update(staff)
            .set({ removedAt: now, updatedAt: now })
            .where(eq(staff.id, member.id));
          // Someone added again later starts with no passkeys, like anyone new.
          await tx.delete(staffPasskeys).where(eq(staffPasskeys.staffId, member.id));
          await recordAudit(tx, actor, {
            action: "staff.removed",
            targetType: "staff",
            targetId: member.id,
            before: { email: member.email, role: member.role },
            reason,
          });
        });
      },

      /** Notes that a staff member used the portal. Writes at most once every few minutes. */
      async seen(member: Staff): Promise<void> {
        const now = Date.now();
        if (member.lastSeenAt && now - member.lastSeenAt.getTime() < SEEN_EVERY_MS) return;
        await db
          .update(staff)
          .set({ lastSeenAt: new Date(now) })
          .where(eq(staff.id, member.id));
      },
    },

    passkeys: {
      /** A staff member's passkeys, oldest first. */
      list(staffId: string): Promise<StaffPasskey[]> {
        return db
          .select()
          .from(staffPasskeys)
          .where(eq(staffPasskeys.staffId, staffId))
          .orderBy(staffPasskeys.createdAt, staffPasskeys.id);
      },

      async find(staffId: string, id: string): Promise<StaffPasskey | null> {
        const [row] = await db
          .select()
          .from(staffPasskeys)
          .where(and(eq(staffPasskeys.staffId, staffId), eq(staffPasskeys.id, id)))
          .limit(1);
        return row ?? null;
      },

      async add(
        member: Staff,
        input: {
          credentialId: string;
          publicKey: string;
          counter: number;
          transports: string[];
          name: string;
        },
        actor: Actor,
      ): Promise<StaffPasskey> {
        return db.transaction(async (tx) => {
          const [row] = await tx
            .insert(staffPasskeys)
            .values({ id: uuidv7(), staffId: member.id, ...input })
            .onConflictDoNothing()
            .returning();
          if (!row) throw new PasskeyExistsError();
          await recordAudit(tx, actor, {
            action: "staff.passkey_added",
            targetType: "staff",
            targetId: member.id,
            after: { passkey: row.id, name: row.name },
          });
          return row;
        });
      },

      async rename(passkey: StaffPasskey, name: string, actor: Actor): Promise<StaffPasskey> {
        if (passkey.name === name) return passkey;
        return db.transaction(async (tx) => {
          const [row] = await tx
            .update(staffPasskeys)
            .set({ name })
            .where(eq(staffPasskeys.id, passkey.id))
            .returning();
          await recordAudit(tx, actor, {
            action: "staff.passkey_renamed",
            targetType: "staff",
            targetId: passkey.staffId,
            before: { passkey: passkey.id, name: passkey.name },
            after: { name },
          });
          return row as StaffPasskey;
        });
      },

      async remove(passkey: StaffPasskey, actor: Actor) {
        await db.transaction(async (tx) => {
          await tx.delete(staffPasskeys).where(eq(staffPasskeys.id, passkey.id));
          await recordAudit(tx, actor, {
            action: "staff.passkey_removed",
            targetType: "staff",
            targetId: passkey.staffId,
            before: { passkey: passkey.id, name: passkey.name },
          });
        });
      },

      /** Removes every passkey a staff member has, for when they have lost them. Returns how many. */
      async reset(member: Staff, reason: string, actor: Actor): Promise<number> {
        return db.transaction(async (tx) => {
          const removed = await tx
            .delete(staffPasskeys)
            .where(eq(staffPasskeys.staffId, member.id))
            .returning({ id: staffPasskeys.id });
          await recordAudit(tx, actor, {
            action: "staff.passkeys_reset",
            targetType: "staff",
            targetId: member.id,
            before: { email: member.email, passkeys: removed.length },
            reason,
          });
          return removed.length;
        });
      },

      /** Notes a use. False if the counter went backwards, which means the passkey was copied. */
      async used(passkey: StaffPasskey, counter: number): Promise<boolean> {
        const updated = await db
          .update(staffPasskeys)
          .set({ counter, lastUsedAt: new Date() })
          .where(
            and(
              eq(staffPasskeys.id, passkey.id),
              // Passkeys that sync between devices don't count: theirs stays at zero.
              counter === 0 ? eq(staffPasskeys.counter, 0) : lt(staffPasskeys.counter, counter),
            ),
          )
          .returning({ id: staffPasskeys.id });
        return updated.length > 0;
      },
    },

    /** Challenges waiting for a passkey's answer. */
    confirmations: {
      async start(
        staffId: string,
        challenge: string,
        what:
          | { kind: "register" }
          | { kind: "confirm"; action: StaffConfirmedAction; target: string },
      ): Promise<string> {
        const id = uuidv7();
        await db.insert(staffConfirmations).values({
          id,
          staffId,
          challenge,
          expiresAt: new Date(Date.now() + STAFF_CONFIRMATION_SECONDS * 1000),
          ...what,
        });
        return id;
      },

      /**
       * Takes a challenge out of play and returns it, or null if it isn't this
       * staff member's, is for something else, has expired or was used before.
       * One statement, so two requests can't both use it.
       */
      async use(
        staffId: string,
        id: string,
        what:
          | { kind: "register" }
          | { kind: "confirm"; action: StaffConfirmedAction; target: string },
      ): Promise<string | null> {
        const now = new Date();
        const [row] = await db
          .update(staffConfirmations)
          .set({ usedAt: now })
          .where(
            and(
              eq(staffConfirmations.id, id),
              eq(staffConfirmations.staffId, staffId),
              eq(staffConfirmations.kind, what.kind),
              isNull(staffConfirmations.usedAt),
              gte(staffConfirmations.expiresAt, now),
              ...(what.kind === "confirm"
                ? [
                    eq(staffConfirmations.action, what.action),
                    eq(staffConfirmations.target, what.target),
                  ]
                : []),
            ),
          )
          .returning({ challenge: staffConfirmations.challenge });
        return row?.challenge ?? null;
      },
    },

    audit: {
      /** Every event, newest first. `query` matches the action, the target, or who acted. */
      async list(options: {
        limit: number;
        before?: string | undefined;
        actorType?: AuditRow["actorType"] | undefined;
        since?: Date | undefined;
        targetId?: string | undefined;
        query?: string | undefined;
      }): Promise<AuditRowWithNames[]> {
        const q = options.query?.trim();
        const pattern = q ? contains(q) : undefined;
        const where: SQL | undefined = and(
          options.before ? lt(auditLog.id, options.before) : undefined,
          options.actorType ? eq(auditLog.actorType, options.actorType) : undefined,
          options.since ? gte(auditLog.occurredAt, options.since) : undefined,
          options.targetId ? eq(auditLog.targetId, options.targetId) : undefined,
          pattern
            ? or(
                ilike(auditLog.action, pattern),
                ilike(auditLog.targetId, pattern),
                ilike(users.name, pattern),
                ilike(users.email, pattern),
                ilike(staff.name, pattern),
                ilike(staff.email, pattern),
              )
            : undefined,
        );
        const rows = await db
          .select({
            row: auditLog,
            userName: users.name,
            userEmail: users.email,
            staffName: staff.name,
          })
          .from(auditLog)
          .leftJoin(users, and(eq(auditLog.actorType, "user"), eq(users.id, auditLog.actorId)))
          .leftJoin(staff, and(eq(auditLog.actorType, "staff"), eq(staff.id, auditLog.actorId)))
          .where(where)
          .orderBy(desc(auditLog.id))
          .limit(options.limit);
        return rows.map((r) => ({ ...r.row, actorName: r.staffName ?? r.userName ?? r.userEmail }));
      },
    },
  };
}

export type StaffOffice = ReturnType<typeof staffOffice>;
