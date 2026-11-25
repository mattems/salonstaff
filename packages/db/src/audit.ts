import { uuidv7 } from "@salonstaff/shared";
import type { Db } from "./index";
import { auditLog } from "./schema";

/** A database handle or an open transaction. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Who is making a change, carried from the request into the audit log. */
export interface Actor {
  type: "user" | "staff" | "system";
  id?: string | undefined;
  ip?: string | undefined;
  requestId?: string | undefined;
  /** The staff passkey that confirmed this change, when it needed one. */
  confirmedWith?: string | undefined;
}

export interface AuditEvent {
  /** e.g. `salon.suspended` */
  action: string;
  targetType?: string | undefined;
  targetId?: string | undefined;
  before?: unknown;
  after?: unknown;
  reason?: string | undefined;
}

/**
 * Writes one audit row. Pass the open transaction so the record and the
 * change it describes succeed or fail together.
 */
export async function recordAudit(tx: Executor, actor: Actor, event: AuditEvent): Promise<void> {
  await tx.insert(auditLog).values({
    id: uuidv7(),
    actorType: actor.type,
    actorId: actor.id,
    ip: actor.ip,
    requestId: actor.requestId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    before: event.before,
    after: event.after,
    reason: event.reason,
    confirmedWith: actor.confirmedWith,
  });
}
