/** D-15: push notifications to the app. Locally (no APNs key) pushes arrive as push+<userId>@local.test. */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type Person, postJob, readySeeker, salonOwner, seekerWithProfile, uid } from "./fixtures";
import { APP_ORIGIN, createTestApp, query } from "./helpers";

const token = () =>
  Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

const userIdOf = async (person: Person) =>
  (await query<{ id: string }>(sql`select id from users where email = ${person.email}`))[0]
    ?.id as string;

const devicesOf = (userId: string) =>
  query<{ token: string; sandbox: boolean }>(
    sql`select token, sandbox from push_devices where user_id = ${userId}`,
  );

const pushesTo = (app: ReturnType<typeof createTestApp>, userId: string) =>
  app.sent.filter((m) => m.to === `push+${userId}@local.test`);

describe("push devices", () => {
  it("says pushes reach the phone once Apple's push service is set up", async () => {
    const app = createTestApp({
      env: {
        APNS_KEY_ID: "KEY123",
        APNS_PRIVATE_KEY: "not-used-to-register",
        APPLE_TEAM_ID: "TEAM123",
        APPLE_BUNDLE_ID: "au.com.salonstaff.app",
      },
    });
    const person = await app.person("Pushc");
    const registered = await person.api("PUT", "/v1/me/push-device", {
      platform: "ios",
      token: token(),
    });
    expect(registered.body).toEqual({ registered: true, delivered: true });
  });

  it("registers this session's phone, once, and moves a token to whoever signs in on it", async () => {
    const app = createTestApp();
    const a = await app.person("Pusha");
    const b = await app.person("Pushb");
    const phone = token();

    const signedOut = await app.call("/v1/me/push-device", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
      body: JSON.stringify({ platform: "ios", token: phone }),
    });
    expect(signedOut.status).toBe(401);
    const bad = await a.api("PUT", "/v1/me/push-device", { platform: "ios", token: "not-hex" });
    expect(bad.status).toBe(400);

    const first = await a.api("PUT", "/v1/me/push-device", {
      platform: "ios",
      token: phone.toUpperCase(),
      sandbox: true,
    });
    expect(first.status).toBe(200);
    // The tests have no APNs key, as locally: pushes wouldn't reach the phone.
    expect(first.body).toEqual({ registered: true, delivered: false });
    await a.api("PUT", "/v1/me/push-device", { platform: "ios", token: phone, sandbox: true });
    const aId = await userIdOf(a);
    expect(await devicesOf(aId)).toEqual([{ token: phone, sandbox: true }]);
    const audited = await query<{ action: string }>(
      sql`select action from audit_log where target_id = ${aId} and action like 'push.%'`,
    );
    expect(audited.map((r) => r.action)).toEqual(["push.device_registered"]);

    // The same phone, now signed in as someone else.
    expect(
      (await b.api("PUT", "/v1/me/push-device", { platform: "ios", token: phone })).status,
    ).toBe(200);
    expect(await devicesOf(aId)).toEqual([]);
    expect(await devicesOf(await userIdOf(b))).toEqual([{ token: phone, sandbox: false }]);
  });

  it("stops when asked, and when the session signs out", async () => {
    const app = createTestApp();
    const person = await app.person("Pushc");
    const id = await userIdOf(person);
    await person.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    const stopped = await person.api("DELETE", "/v1/me/push-device");
    expect(stopped.status).toBe(200);
    expect(await devicesOf(id)).toEqual([]);

    await person.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    expect(await devicesOf(id)).toHaveLength(1);
    const out = await app.call("/v1/auth/sign-out", {
      method: "POST",
      headers: { Cookie: person.cookie, Origin: APP_ORIGIN },
    });
    expect(out.status).toBe(200);
    expect(await devicesOf(id)).toEqual([]);
  });
});

describe("pushes", () => {
  it("pushes a salon's message to the job seeker's phone", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Pushed");
    const seekerUserId = await userIdOf(seeker);
    const me = await seeker.api<{ id: string }>("GET", "/v1/me");
    const { owner, salon } = await salonOwner(app);

    expect(pushesTo(app, seekerUserId)).toEqual([]);
    await seeker.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    const message = `Come in for a trial on Saturday? ${"So much to say. ".repeat(20)}${uid()}`;
    const sent = await owner.api("POST", owner.at(`/candidates/${me.body.id}/messages`), {
      body: message,
    });
    expect(sent.status).toBe(201);
    const pushes = pushesTo(app, seekerUserId);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.subject).toBe(`Push: Someone from ${salon.name}`);
    expect(pushes[0]?.text).toContain("Come in for a trial on Saturday?");
    expect(pushes[0]?.text).toContain("…");
    expect(pushes[0]?.text).toContain(`${APP_ORIGIN}/inbox`);
  });

  it("pushes notices too: a new applicant to the salon's team", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const ownerUserId = await userIdOf(owner);
    await owner.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    const job = await postJob(owner);
    const seeker = await readySeeker(app, "Applier");
    expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);

    const pushes = pushesTo(app, ownerUserId);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.subject).toContain("New applicant");
  });
});

describe("notification preferences", () => {
  const allOn = {
    messages: { push: true, email: true },
    applications: { push: true, email: true },
    account: { push: true, email: true },
    applicants: { push: true, email: true },
    replies: { push: true, email: true },
  };

  it("start all on, and save what's switched off", async () => {
    const app = createTestApp();
    const person = await app.person("Prefs");
    expect((await app.call("/v1/me/notifications")).status).toBe(401);
    expect((await person.api("GET", "/v1/me/notifications")).body).toEqual(allOn);

    const choice = { ...allOn, messages: { push: false, email: true } };
    const saved = await person.api("PUT", "/v1/me/notifications", choice);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(choice);
    expect((await person.api("GET", "/v1/me/notifications")).body).toEqual(choice);
    expect(
      (await person.api("PUT", "/v1/me/notifications", { messages: { push: false } })).status,
    ).toBe(400);
  });

  it("keep a salon team's choices when an older app saves only the job seeker's", async () => {
    const app = createTestApp();
    const person = await app.person("Older app");
    const quiet = { ...allOn, applicants: { push: true, email: false } };
    expect((await person.api("PUT", "/v1/me/notifications", quiet)).status).toBe(200);
    const { applicants: _, replies: __, ...seekerOnly } = allOn;
    const saved = await person.api("PUT", "/v1/me/notifications", {
      ...seekerOnly,
      account: { push: false, email: true },
    });
    expect(saved.body).toEqual({ ...quiet, account: { push: false, email: true } });
  });

  it("hold back a new applicant's email to the salon's team, but still push it (D-20)", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const ownerUserId = await userIdOf(owner);
    await owner.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    await owner.api("PUT", "/v1/me/notifications", {
      ...allOn,
      applicants: { push: true, email: false },
    });
    const job = await postJob(owner);
    const seeker = await readySeeker(app, "Applier");
    expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);
    expect(pushesTo(app, ownerUserId).map((m) => m.subject)).toEqual([
      expect.stringContaining("New applicant"),
    ]);
    expect(app.sent.filter((m) => m.to === owner.email)).toEqual([]);
  });

  it("hold back a job seeker's reply to the salon's team by its own topic, not theirs", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const ownerUserId = await userIdOf(owner);
    await owner.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    // The job seeker's "Messages from salons" being off doesn't stop a salon hearing replies.
    await owner.api("PUT", "/v1/me/notifications", {
      ...allOn,
      messages: { push: false, email: false },
      replies: { push: false, email: true },
    });
    const job = await postJob(owner);
    const seeker = await readySeeker(app, "Replier");
    expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);
    const me = await seeker.api<{ id: string }>("GET", "/v1/me");
    const wrote = await owner.api("POST", owner.at(`/candidates/${me.body.id}/messages`), {
      body: "Can you come in Tuesday?",
    });
    expect(wrote.status).toBe(201);
    const inbox = await seeker.api<{ items: { id: string }[] }>("GET", "/v1/me/conversations");
    const reply = `Tuesday works ${uid()}`;
    const sent = await seeker.api(
      "POST",
      `/v1/me/conversations/${inbox.body.items[0]?.id}/messages`,
      { body: reply },
    );
    expect(sent.status).toBe(201);
    expect(pushesTo(app, ownerUserId).map((m) => m.subject)).not.toContainEqual(
      expect.stringContaining("replied"),
    );
    // By email still (the new applicant's email came first).
    expect(app.sent.filter((m) => m.to === owner.email && m.text.includes(reply))).toHaveLength(1);
  });

  it("hold back a salon's message by the channels switched off", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Quiet");
    const seekerUserId = await userIdOf(seeker);
    const me = await seeker.api<{ id: string }>("GET", "/v1/me");
    await seeker.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    await seeker.api("PUT", "/v1/me/notifications", {
      ...allOn,
      messages: { push: false, email: true },
    });
    const { owner } = await salonOwner(app);
    const message = `A trial on Saturday? ${uid()}`;
    const sent = await owner.api("POST", owner.at(`/candidates/${me.body.id}/messages`), {
      body: message,
    });
    expect(sent.status).toBe(201);
    expect(pushesTo(app, seekerUserId)).toEqual([]);
    expect(app.sent.filter((m) => m.to === seeker.email).map((m) => m.text)).toEqual([
      expect.stringContaining(message),
    ]);
  });

  it("hold back an application update's email but still push it", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner);
    const seeker = await readySeeker(app, "Applicant");
    const seekerUserId = await userIdOf(seeker);
    await seeker.api("PUT", "/v1/me/push-device", { platform: "ios", token: token() });
    await seeker.api("PUT", "/v1/me/notifications", {
      ...allOn,
      applications: { push: true, email: false },
    });
    expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);
    const list = await owner.api<{ items: { id: string }[] }>(
      "GET",
      owner.at(`/jobs/${job.id}/applicants`),
    );
    const applicant = list.body.items[0]?.id as string;
    const moved = await owner.api("PATCH", owner.at(`/applications/${applicant}`), {
      status: "shortlisted",
    });
    expect(moved.status).toBe(200);
    expect(pushesTo(app, seekerUserId).map((m) => m.subject)).toEqual([
      expect.stringContaining("updated your application"),
    ]);
    expect(app.sent.filter((m) => m.to === seeker.email)).toEqual([]);
  });
});
