/**
 * Who is signed in. Read once per page on the server; in the browser it's remembered between
 * pages and forgotten when someone signs in or out (`forgetMe`).
 */
import { redirect } from "@tanstack/react-router";
import { api, orNull, type Schemas } from "./api";

export type Me = Schemas["Me"];

let cached: Promise<Me | null> | undefined;

async function load(): Promise<Me | null> {
  return orNull(await api.GET("/v1/me"));
}

export function currentUser(): Promise<Me | null> {
  if (typeof window === "undefined") return load();
  cached ??= load().catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

/** After signing in or out, or anything that changes the account (a new salon, a profile). */
export function forgetMe() {
  cached = undefined;
}

/** A path on this site that's safe to send someone back to after signing in. */
export function safeNext(next: unknown): string | undefined {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return undefined;
  if (next.startsWith("/api/") || next.startsWith("/sign-in")) return undefined;
  return next;
}

export const signInPath = (next: string, as?: "employer") => {
  const params = new URLSearchParams({ next });
  if (as) params.set("as", as);
  return `/sign-in?${params}`;
};

/** For a page's `beforeLoad`: the signed-in person, or off to sign in and back. */
export function requireSignedIn(me: Me | null, here: string, as?: "employer"): Me {
  if (!me) throw redirect({ href: signInPath(here, as) });
  return me;
}

/** Pages that complete a claim: someone coming back to one shouldn't be sent elsewhere. */
export const isClaimPath = (path: string) =>
  path.startsWith("/claim/") || /^\/salons\/[^/]+\/[^/]+\/[^/]+\/claim(?:$|\?)/.test(path);

/** Where to go once signed in (D-02 flows). */
export function landingAfterSignIn(me: Me, next: string | undefined, as?: string): string {
  if (next && isClaimPath(next)) return next;
  if (me.role === "employer" || as === "employer") {
    if (!me.salon) return "/employer/onboarding";
    return next ?? "/employer";
  }
  if (!me.profile) return next ? `/account?next=${encodeURIComponent(next)}` : "/account";
  return next ?? "/jobs";
}
