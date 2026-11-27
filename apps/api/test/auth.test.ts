import { describe, expect, it } from "vitest";
import { APP_ORIGIN, codeFor, createTestApp } from "./helpers";

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
  body: JSON.stringify(body),
});

describe("health", () => {
  it("is live and ready", async () => {
    const { call } = createTestApp();
    expect((await call("/livez")).status).toBe(200);
    expect((await call("/readyz")).status).toBe(200);
  });

  it("answers the same routes under /api (the website's proxy path)", async () => {
    const { call } = createTestApp();
    expect((await call("/v1")).status).toBe(200);
  });
});

describe("sign in with an email code", () => {
  it("emails a code, signs up on first use, and starts a session", async () => {
    const { call, sent } = createTestApp();
    const email = `new-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const asked = await call(
      "/v1/auth/email-otp/send-verification-otp",
      json({ email, type: "sign-in" }),
    );
    expect(asked.status).toBe(200);
    const code = codeFor(sent, email);

    const wrong = await call(
      "/v1/auth/sign-in/email-otp",
      json({ email, otp: code === "000000" ? "111111" : "000000" }),
    );
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const signedIn = await call("/v1/auth/sign-in/email-otp", json({ email, otp: code }));
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).toContain("session_token");

    const session = await call("/v1/auth/get-session", { headers: { Cookie: cookie } });
    const body = (await session.json()) as { user: { email: string; role: string } };
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe("seeker");
  });
});

describe("sign in with an SMS code", () => {
  it("texts a code (to Mailpit locally) and signs up with a stand-in email", async () => {
    const { call, sent } = createTestApp();
    const phoneNumber = `+6141${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    expect((await call("/v1/auth/phone-number/send-otp", json({ phoneNumber }))).status).toBe(200);
    const code = codeFor(sent, `sms+${phoneNumber.slice(1)}@local.test`);
    const verified = await call("/v1/auth/phone-number/verify", json({ phoneNumber, code }));
    expect(verified.status).toBe(200);
    const cookie = verified.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const session = await call("/v1/auth/get-session", { headers: { Cookie: cookie } });
    const body = (await session.json()) as { user: { email: string; phoneNumber: string } };
    expect(body.user.phoneNumber).toBe(phoneNumber);
    expect(body.user.email).toMatch(/@phone\.salonstaff\.invalid$/);
  });
});

describe("the mobile app (bearer token)", () => {
  // No Origin and no cookies: what a native app sends.
  const native = (body: unknown, token?: string) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  it("signs in with an email code and uses the session token as a bearer", async () => {
    const { call, sent } = createTestApp();
    const email = `app-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const asked = await call(
      "/v1/auth/email-otp/send-verification-otp",
      native({ email, type: "sign-in" }),
    );
    expect(asked.status).toBe(200);
    const signedIn = await call(
      "/v1/auth/sign-in/email-otp",
      native({ email, otp: codeFor(sent, email) }),
    );
    expect(signedIn.status).toBe(200);
    const token = signedIn.headers.get("set-auth-token");
    expect(token).toBeTruthy();

    const bearer = { Authorization: `Bearer ${token}` };
    const me = await call("/v1/me", { headers: bearer });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { email: string }).email).toBe(email);

    // A change with a bearer token needs no Origin.
    const named = await call("/v1/me", {
      ...native({ name: "App Person" }, token ?? ""),
      method: "PATCH",
    });
    expect(named.status).toBe(200);

    expect((await call("/v1/auth/sign-out", native({}, token ?? ""))).status).toBe(200);
    expect((await call("/v1/me", { headers: bearer })).status).toBe(401);
  });

  it("gets a bearer token from the local dev login", async () => {
    const { call } = createTestApp();
    const email = `dev-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const login = await call("/v1/auth/dev-login", native({ email, role: "seeker" }));
    const { token } = (await login.json()) as { token: string };
    const me = await call("/v1/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
  });
});
