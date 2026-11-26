/** Ready-made people, salons and jobs for the API tests. Every name, email and ABN is unique. */
import { isValidAbn } from "@salonstaff/shared";
import { expect } from "vitest";
import { APP_ORIGIN, codeFor, type createTestApp } from "./helpers";

type App = ReturnType<typeof createTestApp>;
export type Person = Awaited<ReturnType<App["person"]>>;

/** Someone on a salon's team, with `at(path)` for that salon's employer routes. */
export type SalonPerson = Person & { salonId: string; at: (path?: string) => string };

/** The employer routes of one salon (D-11). */
export const salonRoute = (salonId: string, path = "") => `/v1/employer/salons/${salonId}${path}`;

/** Points a person's `at(path)` at one of their salons. */
export function asSalon(person: Person, salonId: string): SalonPerson {
  return Object.assign(person, { salonId, at: (path = "") => salonRoute(salonId, path) });
}
/** Anyone who can send requests as themselves. */
export interface Caller {
  api<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: T }>;
}

export const uid = () => crypto.randomUUID().slice(0, 8);

/** A random ABN that passes the checksum. */
export function randomAbn(): string {
  for (;;) {
    const rest = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("");
    for (let prefix = 10; prefix <= 99; prefix++) {
      if (isValidAbn(`${prefix}${rest}`)) return `${prefix}${rest}`;
    }
  }
}

/** A suburb nobody else's test uses, so listings there are only ours. */
export const testSuburb = () => `Testvale ${uid()}`;

/** The smallest valid PNG: one transparent pixel. */
export const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  ),
  (ch) => ch.charCodeAt(0),
);
export const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

export function form(
  fields: Record<string, string | { bytes: Uint8Array; name: string; type: string }>,
) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") data.append(key, value);
    else data.append(key, new File([value.bytes], value.name, { type: value.type }));
  }
  return data;
}

export const profileInput = (overrides: Record<string, unknown> = {}) => ({
  firstName: "Sam",
  lastName: `Tester${uid()}`,
  headline: "Colourist who loves blondes",
  suburb: "Surry Hills",
  state: "NSW",
  postcode: "2010",
  roles: ["colourist"],
  yearsExperience: 6,
  rightToWork: "citizen",
  openToWork: true,
  ...overrides,
});

/** A job seeker with a saved profile. */
export async function seekerWithProfile(app: App, name = "Seeker") {
  const person = await app.person(name);
  const saved = await person.api("PUT", "/v1/me/profile", profileInput());
  expect(saved.status).toBe(200);
  return person;
}

/** Passes the person's identity check through the local mock. */
export async function verifyIdentity(person: Caller, outcome: "verified" | "failed" = "verified") {
  const started = await person.api<{ url: string }>("POST", "/v1/me/checks/identity", {});
  expect(started.status).toBe(200);
  const ref = new URL(started.body.url).searchParams.get("ref") as string;
  const done = await person.api("POST", `/v1/dev/identity/${ref}`, { outcome });
  expect(done.status).toBe(200);
  return ref;
}

/** A job seeker who may apply: profile saved, identity verified. */
export async function readySeeker(app: App, name = "Ready") {
  const person = await seekerWithProfile(app, name);
  await verifyIdentity(person);
  return person;
}

export interface MySalon {
  id: string;
  name: string;
  path: string;
  slug: string;
  freeUntil: string | null;
  listingCredits: number;
  role: "owner" | "manager";
  entitlement: { ok: boolean; via: string | null; reason: string | null };
}

export const salonInput = (overrides: Record<string, unknown> = {}) => ({
  name: `Test Salon ${uid()}`,
  abn: randomAbn(),
  contactName: "Olive Owner",
  phone: "0290001234",
  suburb: testSuburb(),
  state: "NSW",
  postcode: "2010",
  about: "A friendly test salon.",
  ...overrides,
});

/** An employer with their own salon. */
export async function salonOwner(app: App, overrides: Record<string, unknown> = {}) {
  const person = await app.person("Owner", { role: "employer" });
  const created = await person.api<MySalon>("POST", "/v1/employer/salons", salonInput(overrides));
  expect(created.status).toBe(201);
  return { owner: asSalon(person, created.body.id), salon: created.body };
}

export interface SalonJob {
  id: string;
  path: string;
  slug: string;
  title: string;
  status: string;
  paidVia: string | null;
  applicants: number;
  newApplicants: number;
}

export const jobInput = (overrides: Record<string, unknown> = {}) => ({
  title: `Senior Colourist ${uid()}`,
  role: "colourist",
  employmentType: "full_time",
  payMin: 38,
  payMax: 45,
  payPeriod: "hour",
  suburb: "Surry Hills",
  state: "NSW",
  postcode: "2010",
  description: "Lived-in blondes and seamless balayage for a busy, friendly salon. Full column.",
  ...overrides,
});

/** Posts (and by default publishes) a job as the owner. */
export async function postJob(
  owner: SalonPerson,
  overrides: Record<string, unknown> = {},
  publish = true,
) {
  const posted = await owner.api<SalonJob>("POST", owner.at("/jobs"), {
    ...jobInput(overrides),
    publish,
  });
  expect(posted.status).toBe(201);
  return posted.body;
}

/** Someone who signed up with a mobile number only (no email): they're told things by SMS. */
export async function phonePerson(app: App) {
  const phoneNumber = `+6141${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const post = (path: string, body: unknown) =>
    app.call(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
      body: JSON.stringify(body),
    });
  expect((await post("/v1/auth/phone-number/send-otp", { phoneNumber })).status).toBe(200);
  const smsTo = `sms+${phoneNumber.slice(1)}@local.test`;
  const verified = await post("/v1/auth/phone-number/verify", {
    phoneNumber,
    code: codeFor(app.sent, smsTo),
  });
  expect(verified.status).toBe(200);
  const cookie = verified.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown) {
    const response = await app.call(path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: APP_ORIGIN,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as T };
  }
  return { phoneNumber, smsTo, api, email: smsTo };
}
