import { type Actor, type BackOffice, backOffice, type Staff } from "@salonstaff/db";
import { ApiError, type StaffPermission, staffCan } from "@salonstaff/shared";
import type { Context } from "hono";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import type { AppEnv } from "../env";
import { ConfigurationError } from "./auth-config";

export interface StaffContext {
  staff: Staff;
  /** Recorded in the audit log as a staff action, not a customer's. */
  actor: Actor;
  /** Data access across every person and salon (`backOffice`). */
  data: BackOffice;
}

/** Cloudflare's signing keys, fetched once per team domain and cached by the library. */
const accessKeys = new Map<string, JWTVerifyGetKey>();

/**
 * Proof that the request came through Cloudflare Access, and as whom.
 * Access signs a token for everyone it lets in and adds it to the request;
 * nobody else can produce one. Returns the email address Access verified, or
 * null in local development, where there is no Access in front.
 */
async function verifyAccess(c: Context<AppEnv>): Promise<string | null> {
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: audience } = c.env;
  if (isLocal(c)) return null;
  // A deployed environment without these settings must stay shut, not fall open.
  if (!team || !audience) {
    throw new ConfigurationError(
      "ACCESS_TEAM_DOMAIN and ACCESS_AUD are not set, so the admin API is closed. See docs/runbooks/cloudflare-access.md.",
    );
  }

  const refused = (detail: string) =>
    new ApiError("forbidden", {
      detail,
      hint: "Open the admin portal in a browser and sign in through Cloudflare Access.",
    });
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) throw refused("This request did not come through Cloudflare Access");

  let keys = c.get("accessKeys") ?? accessKeys.get(team);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    accessKeys.set(team, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: `https://${team}`,
      audience,
      algorithms: ["RS256"],
    });
    if (typeof payload.email !== "string" || !payload.email) {
      throw new Error("The Access token names no email address");
    }
    return payload.email.toLowerCase();
  } catch {
    throw refused("The Cloudflare Access token is not valid for the admin portal");
  }
}

/** In local development, where there is no Access, the portal says who you are with this header. */
export const LOCAL_STAFF_HEADER = "X-Local-Staff";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Locally there is no Cloudflare Access: a staff picker in the portal says who you are. */
export const isLocal = (c: Context<AppEnv>) => c.env.ENVIRONMENT === "local" && !c.env.ACCESS_AUD;

/**
 * The gate every admin route goes through. In order: did the request come
 * through Cloudflare Access, is the person Access let in a current staff
 * member, and does their staff role allow this? Staff have no Salon Staff
 * account or session: Access is their sign-in.
 */
export async function requireStaff(
  c: Context<AppEnv>,
  permission: StaffPermission,
): Promise<StaffContext> {
  const accessEmail = await verifyAccess(c);
  // Access rides on a cookie, so a change must come from the admin portal, not another site (the
  // website included).
  const origin = c.req.header("Origin");
  const fromPortal = origin !== undefined && origin === c.env.ADMIN_ORIGIN;
  if ((origin !== undefined || !SAFE_METHODS.has(c.req.method)) && !fromPortal) {
    throw new ApiError("forbidden", {
      detail: "This request did not come from the admin portal",
      hint: "Make changes from the admin portal itself.",
    });
  }
  const email = accessEmail ?? c.req.header(LOCAL_STAFF_HEADER)?.trim().toLowerCase();
  if (!email) {
    throw new ApiError("forbidden", {
      detail: "The admin portal doesn't know who you are",
      hint: "Locally there is no Cloudflare Access: choose a staff member on the portal's first screen. Add one with `bun db:staff`.",
    });
  }

  const data = backOffice(await c.get("db")());
  const staff = await data.staff.findActive(email);
  if (!staff) {
    throw new ApiError("forbidden", {
      detail: `${email} is not staff`,
      hint: "Ask a staff owner to add you on the Staff screen. See docs/runbooks/add-a-staff-member.md.",
    });
  }
  if (!staffCan(staff.role, permission)) {
    throw new ApiError("forbidden", {
      detail: `Your staff role (${staff.role}) does not include ${permission}`,
      hint: "Ask a staff owner to do this, or to change your role.",
    });
  }
  await data.staff.seen(staff);

  return {
    staff,
    actor: {
      type: "staff",
      id: staff.id,
      ip: c.req.header("CF-Connecting-IP"),
      requestId: c.get("requestId"),
    },
    data,
  };
}

/**
 * Local development only: the staff a developer can choose to be, since there
 * is no Cloudflare Access to say. Anywhere else this does not exist.
 */
export async function localStaff(c: Context<AppEnv>): Promise<Staff[]> {
  if (!isLocal(c)) {
    throw new ApiError("not_found", {
      detail: "Nothing here",
      hint: "This only exists in local development. Deployed, Cloudflare Access says who you are.",
    });
  }
  return backOffice(await c.get("db")()).staff.list();
}
