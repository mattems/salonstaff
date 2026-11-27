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
    expect(first.body).toEqual({ registered: true });
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
      message,
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
