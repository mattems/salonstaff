import { env } from "cloudflare:test";
import { schema } from "@salonstaff/db";
import { encodeId } from "@salonstaff/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { APP_ORIGIN, codeFor, createTestApp, withDb } from "./helpers";
import {
  admin,
  auditFor,
  confirm,
  register,
  SKIP,
  seedCheck,
  seedJob,
  seedSalon,
  staffMember,
  userIdOf,
} from "./staff";

type Body = Record<string, unknown>;
type User = {
  id: string;
  name: string;
  email: string | null;
  banned_at: string | null;
  open_flags: number;
  role: string;
};
type Page<T> = { data: T[]; next_cursor: string | null };
const { person, call, sent } = createTestApp();

/** Signs in with an email code, as the website does. */
async function signInWithCode(email: string) {
  const post = (path: string, body: unknown) =>
    call(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
      body: JSON.stringify(body),
    });
  await post("/v1/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
  return post("/v1/auth/sign-in/email-otp", { email, otp: codeFor(sent, email) });
}

async function someone(name = "Bea", role: "seeker" | "employer" = "seeker") {
  const who = await person(name, { role });
  const id = await userIdOf(who.email);
  return { ...who, uuid: id, id: encodeId("user", id) };
}

const sessionOf = async (cookie: string) =>
  (await (
    await call("/v1/auth/get-session", { headers: { Cookie: cookie } })
  ).json()) as Body | null;

describe("finding people", () => {
  it("searches by email, name, phone and verification ID, and filters", async () => {
    const support = await staffMember("support");
    const bea = await someone("Bea");
    const ref = `SSV-${crypto.randomUUID().slice(0, 4).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    await seedCheck(bea.uuid, {
      kind: "identity",
      provider: "mock",
      status: "verified",
      reference: ref,
      result: { nameMatched: true },
    });
    const phone = `+6141${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    await withDb((db) =>
      db
        .update(schema.users)
        .set({ phoneNumber: phone, name: `Beatrix ${bea.uuid.slice(0, 6)}` })
        .where(eq(schema.users.id, bea.uuid)),
    );

    for (const q of [
      bea.email,
      `Beatrix ${bea.uuid.slice(0, 6)}`,
      `0${phone.slice(3)}`,
      ref.toLowerCase(),
    ]) {
      const found = await admin<Page<User & { id_verified: boolean }>>(
        support,
        "GET",
        `/users?q=${encodeURIComponent(q)}`,
      );
      expect(found.status).toBe(200);
      expect(found.body.data.map((u) => u.id)).toEqual([bea.id]);
      expect(found.body.data[0]?.id_verified).toBe(true);
    }
    const employers = await admin<Page<User>>(
      support,
      "GET",
      `/users?q=${encodeURIComponent(bea.email)}&role=employer`,
    );
    expect(employers.body.data).toEqual([]);
    const paged = await admin<Page<User>>(support, "GET", "/users?limit=1");
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.next_cursor).toBeTruthy();
  });

  it("shows a person's page: checks without evidence, applications, salons and flags", async () => {
    const support = await staffMember("support");
    const bea = await someone("Bea");
    await seedCheck(bea.uuid);
    const salon = await seedSalon();
    const job = await seedJob(salon.id);
    await withDb((db) =>
      db.insert(schema.applications).values({ jobId: job.id, seekerId: bea.uuid }),
    );

    const { status, body } = await admin<Body & { checks: Body[]; applications: Body[] }>(
      support,
      "GET",
      `/users/${bea.id}`,
    );
    expect(status).toBe(200);
    expect(body.checks[0]).toMatchObject({
      kind: "right_to_work",
      status: "pending",
      result: null,
    });
    expect(JSON.stringify(body)).not.toContain("0123456789012");
    expect(body.applications[0]).toMatchObject({
      job: { title: job.title },
      salon: { name: salon.name },
    });
    expect(body.active_sessions).toBeGreaterThanOrEqual(1);
    expect(
      (await admin(support, "GET", `/users/${encodeId("user", crypto.randomUUID())}`)).status,
    ).toBe(404);
  });
});

describe("flags", () => {
  it("adds and resolves a flag, each audited", async () => {
    const support = await staffMember("support");
    const bea = await someone();
    const flagged = await admin<{ id: string }>(support, "POST", `/users/${bea.id}/flags`, {
      reason: "Reported by a salon",
    });
    expect(flagged.status).toBe(201);
    const list = await admin<Page<User>>(
      support,
      "GET",
      `/users?flagged=true&q=${encodeURIComponent(bea.email)}`,
    );
    expect(list.body.data[0]?.open_flags).toBe(1);

    const resolved = await admin<Body>(support, "POST", `/flags/${flagged.body.id}/resolve`);
    expect(resolved.body.resolved_at).toBeTruthy();
    const actions = (await auditFor(bea.uuid)).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["user.flagged", "user.flag_resolved"]));
  });
});

describe("banning", () => {
  it("signs them out at once, stops them signing in again, and can be lifted", async () => {
    const support = await staffMember("support");
    const bea = await someone();
    expect(await sessionOf(bea.cookie)).toMatchObject({ user: { email: bea.email } });

    const unconfirmed = await admin<Body>(support, "POST", `/users/${bea.id}/ban`, {
      reason: "Fake profile",
    });
    expect(unconfirmed.body.code).toBe("confirmation_required");
    expect(await sessionOf(bea.cookie)).not.toBeNull();

    const banned = await admin<User>(support, "POST", `/users/${bea.id}/ban`, {
      reason: "Fake profile",
      confirmation: SKIP,
    });
    expect(banned.status).toBe(200);
    expect(banned.body.banned_at).toBeTruthy();
    expect(await sessionOf(bea.cookie)).toBeNull();
    // Signing in again is refused while banned.
    expect((await signInWithCode(bea.email)).status).toBe(403);
    const [audit] = await auditFor(bea.uuid, "user.banned");
    expect(audit).toMatchObject({
      actorType: "staff",
      actorId: support.id,
      reason: "Fake profile",
    });

    const lifted = await admin<User>(support, "POST", `/users/${bea.id}/unban`);
    expect(lifted.body.banned_at).toBeNull();
    expect((await signInWithCode(bea.email)).status).toBe(200);
  });

  it("is confirmed with the staff member's passkey when they have one", async () => {
    const support = await staffMember("support");
    const { device } = await register(support);
    const bea = await someone();
    const confirmation = await confirm(support, device, "user.ban", bea.id);
    const banned = await admin(support, "POST", `/users/${bea.id}/ban`, {
      reason: "Scam ads",
      confirmation,
    });
    expect(banned.status).toBe(200);
    const [audit] = await auditFor(bea.uuid, "user.banned");
    expect(audit?.confirmedWith).toBeTruthy();
  });

  it("signs someone out everywhere without banning them", async () => {
    const support = await staffMember("support");
    const bea = await someone();
    const done = await admin<Body>(support, "POST", `/users/${bea.id}/sign-out-everywhere`);
    expect(done.body.sessions_ended).toBeGreaterThanOrEqual(1);
    expect(await sessionOf(bea.cookie)).toBeNull();
  });

  it("resets their verifications, so they can verify again (D-24)", async () => {
    const support = await staffMember("support");
    const readonly = await staffMember("readonly");
    const bea = await someone();
    await seedCheck(bea.uuid, { kind: "identity", status: "verified", provider: "mock" });
    await seedCheck(bea.uuid);
    expect((await admin(readonly, "POST", `/users/${bea.id}/reset-verifications`, {})).status).toBe(
      403,
    );

    const done = await admin<Body>(support, "POST", `/users/${bea.id}/reset-verifications`, {
      reason: "Testing verification again",
    });
    expect(done.status).toBe(200);
    expect(done.body.checks_removed).toBe(2);
    const page = await admin<{ checks: Body[] }>(support, "GET", `/users/${bea.id}`);
    expect(page.body.checks).toEqual([]);
    const [audit] = await auditFor(bea.uuid, "user.verifications_reset");
    expect(audit?.reason).toBe("Testing verification again");
  });

  it("changes a person's role", async () => {
    const support = await staffMember("support");
    const bea = await someone();
    const changed = await admin<User>(support, "PATCH", `/users/${bea.id}`, { role: "employer" });
    expect(changed.body.role).toBe("employer");
    expect(await auditFor(bea.uuid, "user.role_changed")).toHaveLength(1);
  });
});

describe("deleting a person", () => {
  it("needs an owner and a passkey, and removes their files and salons", async () => {
    const owner = await staffMember("owner");
    const support = await staffMember("support");
    const ann = await someone("Ann", "employer");
    const photo = `test-${crypto.randomUUID()}.jpg`;
    const evidence = `test-${crypto.randomUUID()}.pdf`;
    await env.MEDIA.put(photo, "photo");
    await env.PRIVATE.put(evidence, "certificate");
    await withDb((db) =>
      db.insert(schema.seekerProfiles).values({
        userId: ann.uuid,
        firstName: "Ann",
        lastName: "Lee",
        suburb: "Newtown",
        state: "NSW",
        postcode: "2042",
        rightToWork: "citizen",
        photoKey: photo,
      }),
    );
    await seedCheck(ann.uuid, {
      kind: "qualification",
      documentKey: evidence,
      result: { title: "Cert III" },
    });
    const made = await seedSalon({ ownerId: ann.uuid, source: "owner" });
    const claimed = await seedSalon({
      ownerId: ann.uuid,
      source: "directory",
      claimedAt: new Date(),
    });

    expect(
      (await admin(support, "DELETE", `/users/${ann.id}`, { confirmation: SKIP })).status,
    ).toBe(403);
    expect((await admin<Body>(owner, "DELETE", `/users/${ann.id}`, {})).body.code).toBe(
      "confirmation_required",
    );
    const deleted = await admin(owner, "DELETE", `/users/${ann.id}`, {
      reason: "Asked us to",
      confirmation: SKIP,
    });
    expect(deleted.status).toBe(200);

    expect(await env.MEDIA.get(photo)).toBeNull();
    expect(await env.PRIVATE.get(evidence)).toBeNull();
    const rows = await withDb((db) =>
      db.select().from(schema.salons).where(eq(schema.salons.id, claimed.id)),
    );
    expect(rows[0]).toMatchObject({ claimedAt: null, source: "directory" });
    expect(
      await withDb((db) => db.select().from(schema.salons).where(eq(schema.salons.id, made.id))),
    ).toEqual([]);
    expect((await admin(owner, "GET", `/users/${ann.id}`)).status).toBe(404);
    expect(await auditFor(ann.uuid, "user.deleted")).toHaveLength(1);
  });
});
