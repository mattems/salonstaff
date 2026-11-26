import { uuidv7 } from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { salonOwner, uid } from "./fixtures";
import { APP_ORIGIN, codeFor, createTestApp, query } from "./helpers";

type App = ReturnType<typeof createTestApp>;

const post = (body: unknown, cookie?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: APP_ORIGIN,
    ...(cookie ? { Cookie: cookie } : {}),
  },
  body: JSON.stringify(body),
});

const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const auditOf = (email: string) =>
  query<{ action: string; before: unknown; after: unknown }>(
    sql`select action, before, after from audit_log where target_id = (select id::text from users where email = ${email}) order by occurred_at`,
  );

/** Someone who signed up with a mobile number only (a stand-in email). */
async function mobileOnly(app: App) {
  const phoneNumber = `+6141${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  await app.call("/v1/auth/phone-number/send-otp", post({ phoneNumber }));
  const code = codeFor(app.sent, `sms+${phoneNumber.slice(1)}@local.test`);
  const verified = await app.call("/v1/auth/phone-number/verify", post({ phoneNumber, code }));
  expect(verified.status).toBe(200);
  const cookie = cookieOf(verified);
  return {
    phoneNumber,
    api: async <T = Record<string, unknown>>(method: string, path: string, body?: unknown) => {
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
    },
  };
}

describe("changing your email", () => {
  it("sends a code to the new address, then changes it and tells the old one", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const next = `new-${uid()}@example.test`;

    expect((await app.call("/v1/me/email", post({ email: next }))).status).toBe(401);
    expect((await owner.api("POST", "/v1/me/email", { email: "not an email" })).status).toBe(400);
    const same = await owner.api<{ code: string }>("POST", "/v1/me/email", { email: owner.email });
    expect(same.status).toBe(409);

    const dry = await owner.api("POST", "/v1/me/email?dry_run=true", { email: next });
    expect(dry.status).toBe(200);
    expect(app.sent.some((m) => m.to === next)).toBe(false);

    const asked = await owner.api<{ sentTo: string }>("POST", "/v1/me/email", {
      email: next.toUpperCase(),
    });
    expect(asked.status).toBe(200);
    expect(asked.body.sentTo).toBe(next);
    const mail = app.sent.findLast((m) => m.to === next);
    expect(mail?.text).toContain("make this your Salon Staff email address");
    const code = codeFor(app.sent, next);

    const wrong = await owner.api<{ errors: { path: string }[] }>("POST", "/v1/me/email/confirm", {
      email: next,
      code: code === "000000" ? "111111" : "000000",
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors[0]?.path).toBe("code");

    const changed = await owner.api<{ email: string }>("POST", "/v1/me/email/confirm", {
      email: next,
      code,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.email).toBe(next);
    // Same session, new address.
    expect((await owner.api<{ email: string }>("GET", "/v1/me")).body.email).toBe(next);

    const notice = app.sent.findLast((m) => m.to === owner.email);
    expect(notice?.subject).toContain("email was changed");
    expect(notice?.text).toContain(next);

    const audit = await auditOf(next);
    const event = audit.find((row) => row.action === "user.email_changed");
    expect(event?.before).toEqual({ email: owner.email });
    expect(event?.after).toEqual({ email: next });

    // Asking for the address it already is: refused. Codes to the new address now sign in.
    const again = await owner.api("POST", "/v1/me/email/confirm", { email: next, code });
    expect(again.status).toBe(409);
    await app.call(
      "/v1/auth/email-otp/send-verification-otp",
      post({ email: next, type: "sign-in" }),
    );
    const signedIn = await app.call(
      "/v1/auth/sign-in/email-otp",
      post({ email: next, otp: codeFor(app.sent, next) }),
    );
    expect(signedIn.status).toBe(200);
  });

  it("sends nothing to an address that's another account's, and never changes to it", async () => {
    const app = createTestApp();
    const me = await app.person("Mover", { role: "employer" });
    const other = await app.person("Taken", { role: "employer" });
    const before = app.sent.length;
    const asked = await me.api("POST", "/v1/me/email", { email: other.email });
    expect(asked.status).toBe(200);
    expect(app.sent.slice(before).some((m) => m.to === other.email)).toBe(false);
    const guessed = await me.api("POST", "/v1/me/email/confirm", {
      email: other.email,
      code: "123456",
    });
    expect(guessed.status).toBe(400);
    expect((await me.api<{ email: string }>("GET", "/v1/me")).body.email).toBe(me.email);
  });

  it("adds the first email to an account made with a mobile number", async () => {
    const app = createTestApp();
    const person = await mobileOnly(app);
    expect((await person.api<{ email: string | null }>("GET", "/v1/me")).body.email).toBeNull();
    const email = `first-${uid()}@example.test`;
    expect((await person.api("POST", "/v1/me/email", { email })).status).toBe(200);
    const before = app.sent.length;
    const added = await person.api<{ email: string; phoneNumber: string }>(
      "POST",
      "/v1/me/email/confirm",
      { email, code: codeFor(app.sent, email) },
    );
    expect(added.status).toBe(200);
    expect(added.body.email).toBe(email);
    expect(added.body.phoneNumber).toBe(person.phoneNumber);
    // There was no old address to tell.
    expect(app.sent.length).toBe(before);
  });

  it("can't be done with Better Auth's own endpoints, nor can the role be changed", async () => {
    const app = createTestApp();
    const me = await app.person("Sneaky");
    for (const path of [
      "/v1/auth/email-otp/request-email-change",
      "/v1/auth/email-otp/change-email",
      "/v1/auth/update-user",
      "/v1/auth/list-sessions",
      "/v1/auth/revoke-other-sessions",
      "/v1/auth/unlink-account",
    ]) {
      const response = await me.api("POST", path, { newEmail: "x@example.test", role: "employer" });
      expect(response.status, path).toBe(404);
    }
    expect((await me.api<{ role: string }>("GET", "/v1/me")).body.role).toBe("seeker");
  });
});

interface Sessions {
  items: { id: string; device: string; current: boolean; lastActiveAt: string }[];
}

describe("where you're signed in", () => {
  it("lists your devices and signs them out", async () => {
    const app = createTestApp();
    const email = `devices-${uid()}@example.test`;
    const laptop = await app.person("Laptop", { email });
    const phone = await app.person("Phone", { email });
    const tablet = await app.person("Tablet", { email });
    const stranger = await app.person("Stranger");

    expect((await app.call("/v1/me/sessions")).status).toBe(401);
    const listed = await laptop.api<Sessions>("GET", "/v1/me/sessions");
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(3);
    expect(listed.body.items.filter((s) => s.current)).toHaveLength(1);
    expect(listed.body.items[0]?.id).toMatch(/^ses_/);

    const mine = listed.body.items.find((s) => s.current)?.id as string;
    expect((await laptop.api("DELETE", `/v1/me/sessions/${mine}`)).status).toBe(409);
    const theirs = (await stranger.api<Sessions>("GET", "/v1/me/sessions")).body.items[0]?.id;
    expect((await laptop.api("DELETE", `/v1/me/sessions/${theirs}`)).status).toBe(404);
    expect((await laptop.api("DELETE", "/v1/me/sessions/ses_nonsense")).status).toBe(404);

    // The phone's session: the newest one that isn't the laptop's or the tablet's.
    const phoneId = (await phone.api<Sessions>("GET", "/v1/me/sessions")).body.items.find(
      (s) => s.current,
    )?.id;
    const dry = await laptop.api("DELETE", `/v1/me/sessions/${phoneId}?dry_run=true`);
    expect(dry.status).toBe(200);
    expect((await phone.api("GET", "/v1/me")).status).toBe(200);
    expect((await laptop.api("DELETE", `/v1/me/sessions/${phoneId}`)).status).toBe(200);
    expect((await phone.api("GET", "/v1/me")).status).toBe(401);

    const rest = await laptop.api<{ signedOut: number }>("DELETE", "/v1/me/sessions");
    expect(rest.body.signedOut).toBe(1);
    expect((await tablet.api("GET", "/v1/me")).status).toBe(401);
    expect((await laptop.api("GET", "/v1/me")).status).toBe(200);
    expect((await stranger.api("GET", "/v1/me")).status).toBe(200);

    const actions = (await auditOf(email)).map((row) => row.action);
    expect(actions).toContain("auth.signed_out_device");
    expect(actions).toContain("auth.signed_out_elsewhere");
  });
});

interface Methods {
  email: string | null;
  providers: { provider: string; connected: boolean; connectedAt: string | null }[];
}

describe("Google and Apple", () => {
  it("shows what's connected, and disconnects it", async () => {
    const app = createTestApp();
    const me = await app.person("Linked", { role: "employer" });
    const listed = await me.api<Methods>("GET", "/v1/me/sign-in-methods");
    expect(listed.status).toBe(200);
    expect(listed.body.email).toBe(me.email);
    expect(listed.body.providers.map((p) => p.provider)).toEqual(["google", "apple"]);
    expect(listed.body.providers.every((p) => !p.connected)).toBe(true);
    expect((await me.api("DELETE", "/v1/me/sign-in-methods/google")).status).toBe(404);
    expect((await me.api("DELETE", "/v1/me/sign-in-methods/github")).status).toBe(400);

    // As Better Auth leaves it after connecting Google.
    await query(
      sql`insert into accounts (id, user_id, provider_id, account_id, created_at, updated_at)
          select ${uuidv7()}, id, 'google', ${`g-${uid()}`}, now(), now() from users where email = ${me.email}`,
    );
    const connected = await me.api<Methods>("GET", "/v1/me/sign-in-methods");
    expect(connected.body.providers[0]).toMatchObject({ provider: "google", connected: true });

    const dry = await me.api<Methods>("DELETE", "/v1/me/sign-in-methods/google?dry_run=true");
    expect(dry.body.providers[0]?.connected).toBe(false);
    expect(
      (await me.api<Methods>("GET", "/v1/me/sign-in-methods")).body.providers[0]?.connected,
    ).toBe(true);

    const gone = await me.api<Methods>("DELETE", "/v1/me/sign-in-methods/google");
    expect(gone.status).toBe(200);
    expect(gone.body.providers[0]?.connected).toBe(false);
    expect((await auditOf(me.email)).map((row) => row.action)).toContain(
      "auth.provider_disconnected",
    );
  });
});
