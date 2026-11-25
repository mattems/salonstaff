import type { CurrentSession } from "@salonstaff/auth";
import { type Salon, salonScope, salonsFor } from "@salonstaff/db";
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
      hint: "Employer accounts manage their salon under /v1/salon. Sign in with a job seeker account to do this.",
    });
  }
  return session;
}

/** The signed-in person's salon, with the scope for it and their audit actor. */
export async function requireSalon(c: Context<AppEnv>) {
  const session = await requireUser(c);
  const db = await c.get("db")();
  const salon: Salon | null = await salonsFor(db).ownedBy(session.user.id);
  if (!salon) {
    throw new ApiError("not_found", {
      detail: "You don't manage a salon yet",
      hint: "Create one with POST /v1/salon, or claim your business's listing from its page in the directory.",
    });
  }
  return {
    session,
    salon,
    scope: salonScope(db, salon.id),
    actor: userActor(c, session.user.id),
  };
}

/** A prefixed ID from the request, or a 404 naming what wasn't found. */
export function idFrom(kind: IdKind, value: string, what: string, hint: string): string {
  const id = decodeId(kind, value);
  if (!id) throw new ApiError("not_found", { detail: `No ${what} with that ID`, hint });
  return id;
}
