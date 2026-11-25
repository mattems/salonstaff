/**
 * Staff for admin API tests: a stand-in for Cloudflare Access, requests made
 * as a staff member, and passkeys to confirm changes with.
 */
import { backOffice, schema } from "@salonstaff/db";
import { isValidAbn, type StaffRole } from "@salonstaff/shared";
import { and, eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect } from "vitest";
import type { Env } from "../src/env";
import { createTestApp, withDb } from "./helpers";
import { type Flaws, softwarePasskey } from "./passkey";

const TEAM = "salonstaff-test.cloudflareaccess.com";
export const AUD = "test-audience-tag";
export const ADMIN_ORIGIN = "http://localhost:5301";
const ENV: Partial<Env> = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_ORIGIN };
/** The bindings that switch the Access check on, as deployed. */
export const ACCESS = ENV;
const cloudflare = await generateKeyPair("RS256");
const accessKeys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(cloudflare.publicKey)), alg: "RS256" }],
});

export type Who = { email: string; id: string };
export type Device = Awaited<ReturnType<typeof softwarePasskey>>;
export type Challenge = {
  id: string;
  options: { challenge: string };
  can_skip: boolean;
};
/** A token as Cloudflare Access signs it, or (with `key`, `audience`, `issuer`) a forgery. */
export function accessToken(
  email: string,
  options: { key?: CryptoKey; audience?: string; issuer?: string } = {},
) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(options.issuer ?? `https://${TEAM}`)
    .setAudience(options.audience ?? AUD)
    .setExpirationTime("5m")
    .sign(options.key ?? (cloudflare.privateKey as CryptoKey));
}

/** In place of a passkey's answer. The API takes it only in local development, which the tests run as. */
export const SKIP = { skip: true };

const skips = (body: unknown) =>
  (body as { confirmation?: { skip?: boolean } } | undefined)?.confirmation?.skip === true;

/**
 * Whether a request goes as local development sends it: no Cloudflare Access, the staff member
 * named in `X-Local-Staff`. Only there may a confirmation be skipped, so a request that skips
 * goes that way unless its environment isn't local, or it sets `ACCESS_AUD` itself.
 */
export function sentLocally(body: unknown, env: Partial<Env>): boolean {
  if (Object.hasOwn(env, "ACCESS_AUD")) return !env.ACCESS_AUD;
  return (env.ENVIRONMENT ?? "local") === "local" && skips(body);
}

/** The bindings for a request sent locally: Access isn't set up. */
const withoutAccess: Partial<Env> = { ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" };

/** Requests to the admin API as a staff member, from an app of its own (e.g. with a fake Stripe). */
export function adminCaller(options: { stripeFetch?: typeof fetch } = {}) {
  const { call, sent } = createTestApp({ accessKeys, ...options });
  const admin = async function admin<T = Record<string, unknown>>(
    who: { email: string },
    method: string,
    path: string,
    body?: unknown,
    env: Partial<Env> = {},
  ) {
    const token = await accessToken(who.email);
    const local = sentLocally(body, env);
    const isForm = body instanceof FormData;
    const response = await call(
      `/admin/v1${path}`,
      {
        method,
        headers: {
          Origin: ADMIN_ORIGIN,
          ...(local ? { "X-Local-Staff": who.email } : { "Cf-Access-Jwt-Assertion": token }),
          ...(body === undefined || isForm ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: isForm ? body : JSON.stringify(body) }),
      },
      { ...ENV, ...env, ...(local ? withoutAccess : {}) },
    );
    // A file (a check's certificate) has no JSON: its headers say what it is.
    const isJson = response.headers.get("Content-Type")?.includes("json") ?? false;
    const answer = (isJson ? await response.json() : null) as T;
    return { status: response.status, body: answer, headers: response.headers };
  };
  // What it sent, e.g. the notice a claim decision sends; `call` for requests made by hand.
  return Object.assign(admin, { sent, call });
}

export const admin = adminCaller();

export async function staffMember(role: StaffRole, name = "Staff") {
  const email = `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@staff.test`;
  const row = await withDb((db) =>
    backOffice(db).staff.add({ name, email, role }, { type: "system" }),
  );
  return { name, email, id: row.id };
}

/** Asks for a challenge and has the passkey answer it: what goes in a request's `confirmation`. */
export async function confirm(
  who: Who,
  device: Device,
  action: string,
  target: string,
  flaws?: Flaws,
) {
  const { body } = await admin<Challenge>(who, "POST", "/confirmations", { action, target });
  return { id: body.id, response: await device.answer(body.options, flaws) };
}

/** Registers a passkey: the first with nothing more, later ones confirmed with `using`. */
export async function register(who: Who, name = "MacBook", using?: Device) {
  const device = await softwarePasskey(ADMIN_ORIGIN);
  const confirmation = using ? await confirm(who, using, "passkey.add", "new") : undefined;
  const started = await admin<Challenge>(who, "POST", "/passkeys/options", { confirmation });
  expect(started.status).toBe(200);
  const made = await admin<{ id: string; name: string; last_used_at: string | null }>(
    who,
    "POST",
    "/passkeys",
    { id: started.body.id, name, response: await device.register(started.body.options) },
  );
  expect(made.status).toBe(201);
  return { device, passkey: made.body };
}

// ---------------------------------------------------------------------------
// Rows for admin tests, made straight in the database. Every value is unique, so tests running
// in parallel never touch each other's rows.
// ---------------------------------------------------------------------------

const tag = () => crypto.randomUUID().slice(0, 8);

/** An ABN that passes the checksum, different every time. */
export function testAbn(): string {
  for (;;) {
    const abn = String(10_000_000_000 + Math.floor(Math.random() * 89_999_999_999));
    if (isValidAbn(abn)) return abn;
  }
}

/** The user row behind an email address (people made with `person()`). */
export async function userIdOf(email: string): Promise<string> {
  const [row] = await withDb((db) =>
    db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)),
  );
  if (!row) throw new Error(`No user ${email}`);
  return row.id;
}

export async function seedSalon(
  values: Partial<typeof schema.salons.$inferInsert> = {},
): Promise<typeof schema.salons.$inferSelect> {
  const t = tag();
  const [row] = await withDb((db) =>
    db
      .insert(schema.salons)
      .values({
        name: `Salon ${t}`,
        slug: `salon-${t}`,
        suburb: `Suburb ${t}`,
        suburbSlug: `suburb-${t}`,
        state: "NSW",
        postcode: "2000",
        ...values,
      })
      .returning(),
  );
  return row as typeof schema.salons.$inferSelect;
}

export async function seedJob(
  salonId: string,
  values: Partial<typeof schema.jobs.$inferInsert> = {},
): Promise<typeof schema.jobs.$inferSelect> {
  const t = tag();
  const [row] = await withDb((db) =>
    db
      .insert(schema.jobs)
      .values({
        salonId,
        slug: `job-${t}`,
        suburbSlug: `suburb-${t}`,
        title: `Senior Colourist ${t}`,
        role: "colourist",
        employmentType: "full_time",
        suburb: `Suburb ${t}`,
        state: "NSW",
        postcode: "2000",
        description: "Join our team.",
        status: "published",
        publishedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        ...values,
      })
      .returning(),
  );
  return row as typeof schema.jobs.$inferSelect;
}

export async function seedCheck(
  userId: string,
  values: Partial<typeof schema.seekerChecks.$inferInsert> = {},
): Promise<typeof schema.seekerChecks.$inferSelect> {
  const [row] = await withDb((db) =>
    db
      .insert(schema.seekerChecks)
      .values({
        userId,
        kind: "right_to_work",
        provider: "manual",
        result: { basis: "visa", visaGrantNumber: "0123456789012", passportCountry: "NZ" },
        ...values,
      })
      .returning(),
  );
  return row as typeof schema.seekerChecks.$inferSelect;
}

export async function seedClaim(
  salonId: string,
  userId: string,
  values: Partial<typeof schema.salonClaims.$inferInsert> = {},
): Promise<typeof schema.salonClaims.$inferSelect> {
  const [row] = await withDb((db) =>
    db
      .insert(schema.salonClaims)
      .values({
        salonId,
        userId,
        abn: testAbn(),
        contactName: "Casey Owner",
        phone: "0412345678",
        status: "pending_review",
        ...values,
      })
      .returning(),
  );
  return row as typeof schema.salonClaims.$inferSelect;
}

/** Audit rows about one thing (its uuid), oldest first. */
export const auditFor = (targetId: string, action?: string) =>
  withDb((db) =>
    db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.targetId, targetId),
          action ? eq(schema.auditLog.action, action) : undefined,
        ),
      )
      .orderBy(schema.auditLog.id),
  );
