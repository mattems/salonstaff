import type { CurrentSession } from "@salonstaff/auth";
import { type Salon, salonScope, salonsFor, salonTeam } from "@salonstaff/db";
import { ApiError, decodeId, type IdKind } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { userActor } from "./actor";

/** The signed-in person, or a 401. */
export async function requireUser(c: Context<AppEnv>): Promise<CurrentSession> {
  const session = await c.get("session")();
  if (!session) {
    throw new ApiError("unauthenticated", {
      hint: "Sign in first: an email or SMS code through /v1/auth, or Google or Apple.",
    });
  }
  return session;
}

/** A signed-in job seeker. Employer accounts manage a salon instead. */
export async function requireSeeker(c: Context<AppEnv>): Promise<CurrentSession> {
  const session = await requireUser(c);
  if (session.user.role !== "seeker") {
    throw new ApiError("forbidden", {
      detail: "This is for job seeker accounts",
      hint: "Employer accounts manage their salons under /v1/employer/salons. Sign in with a job seeker account to do this.",
    });
  }
  return session;
}

/**
 * One of the signed-in person's salons (D-11), with the scope for it, their role there and their
 * audit actor. Someone not on its team gets a 404; a manager asking for an owner's job, a 403.
 */
export async function requireSalon(
  c: Context<AppEnv>,
  salonParam: string,
  need: "manager" | "owner" = "manager",
) {
  const session = await requireUser(c);
  const db = await c.get("db")();
  const hint =
    "List your salons with GET /v1/employer/salons and use an `id` from there. Create one with POST /v1/employer/salons, or claim your business's listing from its page in the directory.";
  const salonId = idFrom("salon", salonParam, "salon you manage", hint);
  const membership = await salonsFor(db).membership(session.user.id, salonId);
  if (!membership) {
    throw new ApiError("not_found", { detail: "You don't manage a salon with that ID", hint });
  }
  if (need === "owner" && membership.role !== "owner") {
    throw new ApiError("forbidden", {
      detail: "Only the salon's owners can do this",
      hint: "Ask an owner of the salon to do it, or to make you an owner.",
    });
  }
  return {
    session,
    salon: membership.salon as Salon,
    role: membership.role,
    scope: salonScope(db, salonId),
    team: salonTeam(db, salonId),
    actor: userActor(c, session.user.id),
  };
}

/** A prefixed ID from the request, or a 404 naming what wasn't found. */
export function idFrom(kind: IdKind, value: string, what: string, hint: string): string {
  const id = decodeId(kind, value);
  if (!id) throw new ApiError("not_found", { detail: `No ${what} with that ID`, hint });
  return id;
}
