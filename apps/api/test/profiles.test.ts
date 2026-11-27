/** D-13, D-19: who sees a job seeker's profile, sharing it, contacting them, their mobile and endorsements. */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type Person, salonOwner, seekerWithProfile, uid } from "./fixtures";
import { APP_ORIGIN, codeFor, createTestApp, query } from "./helpers";

type App = ReturnType<typeof createTestApp>;

interface Settings {
  visibility: string;
  contactBy: string;
  shareCode: string | null;
  sharePath: string | null;
}

const randomMobile = () => `+6141${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const smsTo = (phoneNumber: string) => `sms+${phoneNumber.slice(1)}@local.test`;

/** Gives the person a verified mobile through the audited change. */
async function addMobile(app: App, person: Person, phoneNumber = randomMobile()) {
  const asked = await person.api("POST", "/v1/me/mobile", { phoneNumber });
  expect(asked.status).toBe(200);
  const code = codeFor(app.sent, smsTo(phoneNumber));
  const done = await person.api("POST", "/v1/me/mobile/confirm", { phoneNumber, code });
  expect(done.status).toBe(200);
  return phoneNumber;
}

const idOf = async (person: Person) => (await person.api<{ id: string }>("GET", "/v1/me")).body.id;

describe("profile visibility and the share link", () => {
  it("is open to salons by default; going public makes a share link that hides private details", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Sharer");
    const mine = await seeker.api<{ settings: Settings }>("GET", "/v1/me/profile");
    expect(mine.body.settings).toEqual({
      visibility: "salons",
      contactBy: "both",
      shareCode: null,
      sharePath: null,
    });

    const opened = await seeker.api<Settings>("PATCH", "/v1/me/profile/settings", {
      visibility: "public",
    });
    expect(opened.status).toBe(200);
    expect(opened.body.shareCode).toMatch(/^[2-9a-hjkmnp-z]{10}$/);
    expect(opened.body.sharePath).toBe(`/p/${opened.body.shareCode}`);
    const code = opened.body.shareCode as string;

    const page = await app.call(`/v1/profiles/${code}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("X-Robots-Tag")).toContain("noindex");
    const shared = (await page.json()) as {
      name: string;
      profile: Record<string, unknown>;
      viewer: unknown;
    };
    expect(shared.name).toMatch(/^Sam T\.$/);
    for (const hidden of ["lastName", "postcode", "rightToWork", "payMin"]) {
      expect(shared.profile).not.toHaveProperty(hidden);
    }
    expect(JSON.stringify(shared)).not.toContain(seeker.email);
    expect(shared.viewer).toBeNull();
    expect((await app.call("/v1/profiles/not-a-code")).status).toBe(404);

    // Salons only: the link stops working, and comes back with the same code.
    await seeker.api("PATCH", "/v1/me/profile/settings", { visibility: "salons" });
    expect((await app.call(`/v1/profiles/${code}`)).status).toBe(404);
    const again = await seeker.api<Settings>("PATCH", "/v1/me/profile/settings", {
      visibility: "public",
    });
    expect(again.body.shareCode).toBe(code);

    // A new code kills the old link.
    const renewed = await seeker.api<Settings>("POST", "/v1/me/profile/share-code");
    expect(renewed.body.shareCode).not.toBe(code);
    expect((await app.call(`/v1/profiles/${code}`)).status).toBe(404);
    expect((await app.call(`/v1/profiles/${renewed.body.shareCode}`)).status).toBe(200);
  });

  it("only offers contact by a way the account has", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "NoMobile");
    const refused = await seeker.api<{ errors: { path: string }[] }>(
      "PATCH",
      "/v1/me/profile/settings",
      { contactBy: "phone" },
    );
    expect(refused.status).toBe(400);
    expect(refused.body.errors[0]?.path).toBe("contactBy");
    await addMobile(app, seeker);
    expect(
      (await seeker.api("PATCH", "/v1/me/profile/settings", { contactBy: "phone" })).status,
    ).toBe(200);
  });
});

describe("changing your mobile", () => {
  it("sends a code to the new number, changes it and tells the old one", async () => {
    const app = createTestApp();
    const seeker = await app.person("Mover");
    const first = await addMobile(app, seeker);
    expect((await seeker.api<{ phoneNumber: string }>("GET", "/v1/me")).body.phoneNumber).toBe(
      first,
    );

    const same = await seeker.api("POST", "/v1/me/mobile", { phoneNumber: first });
    expect(same.status).toBe(409);
    expect((await seeker.api("POST", "/v1/me/mobile", { phoneNumber: "0212345678" })).status).toBe(
      400,
    );

    const next = randomMobile();
    // Any usual format; stored as +614….
    await seeker.api("POST", "/v1/me/mobile", { phoneNumber: `0${next.slice(3)}` });
    const wrong = await seeker.api("POST", "/v1/me/mobile/confirm", {
      phoneNumber: next,
      code: "000000",
    });
    expect(wrong.status).toBe(400);
    const code = codeFor(app.sent, smsTo(next));
    const done = await seeker.api<{ phoneNumber: string }>("POST", "/v1/me/mobile/confirm", {
      phoneNumber: next,
      code,
    });
    expect(done.status).toBe(200);
    expect(done.body.phoneNumber).toBe(next);
    expect(app.sent.findLast((m) => m.to === smsTo(first))?.text).toContain("was changed");

    const audit = await query<{ action: string }>(
      sql`select action from audit_log where target_id = (select id::text from users where email = ${seeker.email}) and action = 'user.mobile_changed'`,
    );
    expect(audit).toHaveLength(2);
  });

  it("sends nothing to another account's number, and refuses Better Auth's own change", async () => {
    const app = createTestApp();
    const owner = await app.person("Holder");
    const taken = await addMobile(app, owner);
    const other = await app.person("Taker");
    const before = app.sent.length;
    const asked = await other.api("POST", "/v1/me/mobile", { phoneNumber: taken });
    expect(asked.status).toBe(200);
    expect(app.sent.length).toBe(before);

    const raw = await app.call("/v1/auth/phone-number/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP_ORIGIN, Cookie: other.cookie },
      body: JSON.stringify({
        phoneNumber: randomMobile(),
        code: "123456",
        updatePhoneNumber: true,
      }),
    });
    expect(raw.status).toBe(404);
  });
});

describe("salons contacting a job seeker", () => {
  it("writes in their conversation, shows number looks there, and limits cold messages", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Wanted");
    const mobile = await addMobile(app, seeker);
    const seekerId = await idOf(seeker);
    const { owner, salon } = await salonOwner(app);
    const write = (body: string) =>
      owner.api("POST", owner.at(`/candidates/${seekerId}/messages`), { body });

    const candidate = await owner.api<{ contact: unknown; applications: unknown[] }>(
      "GET",
      owner.at(`/candidates/${seekerId}`),
    );
    expect(candidate.status).toBe(200);
    expect(candidate.body.contact).toEqual({ message: true, phone: true });
    expect(candidate.body.applications).toEqual([]);

    expect((await write(" ")).status).toBe(400);
    const message = `We'd love you to come in for a trial at our salon. ${uid()}`;
    expect((await write(message)).status).toBe(201);
    const mail = app.sent.findLast((m) => m.to === seeker.email);
    expect(mail?.replyTo).toBeUndefined();
    expect(mail?.text).toContain(message);
    expect(mail?.subject).toBe(`${salon.name} sent you a message`);
    // Cold (not applied, not replied): once a day to the same person.
    expect((await write("Just checking you got that?")).status).toBe(429);

    const phone = await owner.api<{ phone: string }>(
      "POST",
      owner.at(`/candidates/${seekerId}/phone`),
    );
    expect(phone.body.phone).toBe(mobile);
    // Looking again the same day isn't counted or shown again.
    await owner.api("POST", owner.at(`/candidates/${seekerId}/phone`));

    // Both in the one conversation, unread until opened.
    const unread = async () =>
      (await seeker.api<{ unreadMessages: number }>("GET", "/v1/me")).body.unreadMessages;
    expect(await unread()).toBe(2);
    const inbox = await seeker.api<{ items: { id: string; salon: { name: string } }[] }>(
      "GET",
      "/v1/me/conversations",
    );
    expect(inbox.body.items.map((c) => c.salon.name)).toEqual([salon.name]);
    const id = inbox.body.items[0]?.id as string;
    const opened = await seeker.api<{
      messages: { kind: string; body: string }[];
      canSend: boolean;
    }>("GET", `/v1/me/conversations/${id}`);
    expect(opened.body.messages.map((m) => m.kind)).toEqual(["text", "number_viewed"]);
    expect(opened.body.messages[0]?.body).toBe(message);
    expect(opened.body.canSend).toBe(true);
    expect(await unread()).toBe(0);

    // Once they reply it isn't cold, and the salon can keep writing.
    expect(
      (await seeker.api("POST", `/v1/me/conversations/${id}/messages`, { body: "Yes please!" }))
        .status,
    ).toBe(201);
    expect((await write("Great, does Tuesday suit?")).status).toBe(201);
    // Someone else can't read it.
    const other = await app.person("Nosy");
    expect((await other.api("GET", `/v1/me/conversations/${id}`)).status).not.toBe(200);

    // Messages only: no number. Phone only: no messages.
    await seeker.api("PATCH", "/v1/me/profile/settings", { contactBy: "email" });
    expect((await owner.api("POST", owner.at(`/candidates/${seekerId}/phone`))).status).toBe(409);
    await seeker.api("PATCH", "/v1/me/profile/settings", { contactBy: "phone" });
    expect((await write("One more thing")).status).toBe(409);
    const shut = await owner.api<{ canSend: boolean; sendHint: string }>(
      "GET",
      owner.at(`/candidates/${seekerId}/conversation`),
    );
    expect(shut.body.canSend).toBe(false);
    expect(shut.body.sendHint).toContain("Call them instead");
  });

  it("limits how many new people a salon writes to cold each day", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const { CONTACT_LIMITS } = await import("@salonstaff/shared");
    for (let i = 0; i < CONTACT_LIMITS.messagesPerDay; i++) {
      const filler = await seekerWithProfile(app, `Filler${i}`);
      const fillerId = await idOf(filler);
      expect(
        (await owner.api("POST", owner.at(`/candidates/${fillerId}/messages`), { body: "Hi" }))
          .status,
      ).toBe(201);
    }
    const next = await seekerWithProfile(app, "OneTooMany");
    const refused = await owner.api<{ detail: string }>(
      "POST",
      owner.at(`/candidates/${await idOf(next)}/messages`),
      { body: "Hi" },
    );
    expect(refused.status).toBe(429);
    expect(refused.body.detail).toContain("new people");
  });

  it("keeps hidden profiles, and salons they hid from, out", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Private");
    const seekerId = await idOf(seeker);
    const { owner, salon } = await salonOwner(app);

    expect((await seeker.api("PUT", `/v1/me/hidden-salons/${salon.id}`)).status).toBe(200);
    const hidden = await seeker.api<{ items: { id: string }[] }>("GET", "/v1/me/hidden-salons");
    expect(hidden.body.items.map((s) => s.id)).toEqual([salon.id]);
    expect((await owner.api("GET", owner.at(`/candidates/${seekerId}`))).status).toBe(404);
    expect(
      (
        await owner.api("POST", owner.at(`/candidates/${seekerId}/messages`), {
          body: "Are you free for a chat this week?",
        })
      ).status,
    ).toBe(404);

    await seeker.api("DELETE", `/v1/me/hidden-salons/${salon.id}`);
    expect((await owner.api("GET", owner.at(`/candidates/${seekerId}`))).status).toBe(200);
    await seeker.api("PATCH", "/v1/me/profile/settings", { visibility: "hidden" });
    expect((await owner.api("GET", owner.at(`/candidates/${seekerId}`))).status).toBe(404);
  });

  it("tells a salon's team on a share page how they can make contact", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Posted");
    const { shareCode } = (
      await seeker.api<Settings>("PATCH", "/v1/me/profile/settings", { visibility: "public" })
    ).body;
    const { owner, salon } = await salonOwner(app);
    const seen = await owner.api<{
      viewer: { salons: { id: string; candidateId: string; contact: unknown }[] };
    }>("GET", `/v1/profiles/${shareCode}`);
    expect(seen.body.viewer.salons).toEqual([
      {
        id: salon.id,
        name: salon.name,
        candidateId: await idOf(seeker),
        contact: { message: true, phone: false },
      },
    ]);
    // Another job seeker is just a visitor.
    const other = await app.person("Browser");
    expect(
      (await other.api<{ viewer: unknown }>("GET", `/v1/profiles/${shareCode}`)).body.viewer,
    ).toBeNull();
  });
});

describe("endorsements", () => {
  const written = {
    name: "Olive Owner",
    title: "Salon owner",
    salonName: "Inner West Hair",
    relationship: "managed",
    body: "Sam ran our colour bar for three years and trained every apprentice we had.",
    contactOk: true,
    phone: "02 9000 1234",
  };

  async function ask(app: App, seeker: Person, refereeEmail: string) {
    const asked = await seeker.api<{ id: string; status: string }>("POST", "/v1/me/endorsements", {
      refereeName: "Olive",
      refereeEmail,
      note: "Would mean a lot!",
    });
    const mail = app.sent.findLast((m) => m.to === refereeEmail);
    const token = mail?.text.match(/\/endorse\/([A-Za-z0-9_-]+)/)?.[1] as string;
    return { asked, token, mail };
  }

  it("asks by email, the referee writes it once, and the job seeker chooses to show it", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Endorsed");
    const { owner, salon } = await salonOwner(app);

    expect(
      (
        await seeker.api("POST", "/v1/me/endorsements", {
          refereeName: "Me",
          refereeEmail: seeker.email,
        })
      ).status,
    ).toBe(400);

    const { asked, token, mail } = await ask(app, seeker, owner.email);
    expect(asked.status).toBe(201);
    expect(asked.body.status).toBe("requested");
    expect(mail?.text).toContain("Would mean a lot!");
    expect(token).toBeTruthy();
    expect((await ask(app, seeker, owner.email)).asked.status).toBe(409);

    const page = await app.call(`/v1/endorsements/${token}`);
    expect(((await page.json()) as { name: string }).name).toMatch(/^Sam T\.$/);
    const tooShort = await app.call(`/v1/endorsements/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
      body: JSON.stringify({ ...written, body: "Great." }),
    });
    expect(tooShort.status).toBe(400);
    const write = () =>
      app.call(`/v1/endorsements/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
        body: JSON.stringify(written),
      });
    expect((await write()).status).toBe(201);
    expect(app.sent.findLast((m) => m.to === seeker.email)?.subject).toContain("Olive Owner");
    expect((await write()).status).toBe(404);
    expect((await app.call(`/v1/endorsements/${token}`)).status).toBe(404);

    const mine = await seeker.api<{
      items: { id: string; status: string; onSalonStaff: boolean; body: string }[];
    }>("GET", "/v1/me/endorsements");
    const [item] = mine.body.items;
    expect(item).toMatchObject({ status: "received", onSalonStaff: true, body: written.body });

    // Not on the profile until shown.
    const seekerId = await idOf(seeker);
    type Candidate = {
      endorsements: { onSalonStaff: { name: string } | null; contact: unknown }[];
    };
    expect(
      (await owner.api<Candidate>("GET", owner.at(`/candidates/${seekerId}`))).body.endorsements,
    ).toEqual([]);
    const shown = await seeker.api("PATCH", `/v1/me/endorsements/${item?.id}`, { shown: true });
    expect(shown.status).toBe(200);
    const [onProfile] = (await owner.api<Candidate>("GET", owner.at(`/candidates/${seekerId}`)))
      .body.endorsements;
    expect(onProfile?.onSalonStaff?.name).toBe(salon.name);
    // The referee's contact details only for a salon they applied to.
    expect(onProfile?.contact).toBeNull();

    expect((await seeker.api("DELETE", `/v1/me/endorsements/${item?.id}`)).status).toBe(200);
    expect(
      (await seeker.api<{ items: unknown[] }>("GET", "/v1/me/endorsements")).body.items,
    ).toEqual([]);
  });

  it("can't be shown before it's written", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Waiting");
    const { asked } = await ask(app, seeker, `ref-${uid()}@example.test`);
    expect(
      (await seeker.api("PATCH", `/v1/me/endorsements/${asked.body.id}`, { shown: true })).status,
    ).toBe(404);
  });
});
