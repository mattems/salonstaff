import { backOffice, LastOwnerError, schema } from "@salonstaff/db";
import { decodeId, encodeId, uuidv7 } from "@salonstaff/shared";
import { and, eq, ne } from "drizzle-orm";
import { generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { APP_ORIGIN, createTestApp, withDb } from "./helpers";
import { ACCESS, ADMIN_ORIGIN, accessToken, admin, SKIP, staffMember, type Who } from "./staff";

type Body = Record<string, unknown>;
const system = { type: "system" as const };
const impostor = await generateKeyPair("RS256");
const { call } = admin;

/** A made-up ID of each kind, for routes that are refused before they look anything up. */
const some = {
  user: encodeId("user", uuidv7()),
  salon: encodeId("salon", uuidv7()),
  job: encodeId("job", uuidv7()),
  check: encodeId("check", uuidv7()),
  claim: encodeId("claim", uuidv7()),
  flag: encodeId("flag", uuidv7()),
  staff: encodeId("staff", uuidv7()),
};

/** Every admin route, with a body it would accept. */
const ROUTES: [string, string, unknown?][] = [
  ["GET", "/me"],
  ["GET", "/overview"],
  ["GET", "/queues"],
  ["GET", "/staff"],
  ["POST", "/staff", { name: "X", email: "x@staff.test", role: "readonly", reason: "Testing" }],
  ["PATCH", `/staff/${some.staff}`, { role: "readonly", reason: "Testing" }],
  ["DELETE", `/staff/${some.staff}`, { reason: "Testing" }],
  ["DELETE", `/staff/${some.staff}/passkeys`, { reason: "Testing" }],
  ["GET", "/audit-log"],
  ["GET", "/passkeys"],
  ["POST", "/confirmations", { action: "user.ban", target: some.user }],
  ["GET", "/users"],
  ["GET", `/users/${some.user}`],
  ["POST", `/users/${some.user}/flags`, { reason: "Testing" }],
  ["POST", `/flags/${some.flag}/resolve`],
  ["POST", `/users/${some.user}/ban`, { reason: "Testing" }],
  ["POST", `/users/${some.user}/unban`],
  ["POST", `/users/${some.user}/sign-out-everywhere`],
  ["PATCH", `/users/${some.user}`, { role: "employer" }],
  ["DELETE", `/users/${some.user}`, {}],
  ["GET", "/salons"],
  ["GET", `/salons/${some.salon}`],
  ["POST", `/salons/${some.salon}/status`, { status: "suspended", reason: "Testing" }],
  ["DELETE", `/salons/${some.salon}`, {}],
  ["POST", `/salons/${some.salon}/abn`, { status: "verified" }],
  ["POST", `/salons/${some.salon}/free-period`, { days: 30 }],
  ["POST", `/salons/${some.salon}/credits`, { delta: 1, reason: "Testing" }],
  ["POST", `/salons/${some.salon}/founding`, { founding: true }],
  ["POST", `/salons/${some.salon}/unclaim`],
  [
    "POST",
    "/directory/listings",
    { name: "Gate Hair", suburb: "Newtown", state: "NSW", postcode: "2042" },
  ],
  ["GET", "/jobs"],
  ["POST", `/jobs/${some.job}/feature`, { featured: true }],
  ["POST", `/jobs/${some.job}/take-down`, { reason: "Testing" }],
  ["POST", `/jobs/${some.job}/relist`],
  ["GET", "/payments"],
  ["GET", "/checks"],
  ["GET", `/checks/${some.check}/document`],
  ["POST", `/checks/${some.check}/decision`, { decision: "verified" }],
  ["GET", "/claims"],
  ["POST", `/claims/${some.claim}/approve`, {}],
  ["POST", `/claims/${some.claim}/reject`, { note: "Testing" }],
];

describe("the staff gate", () => {
  it("lets in a staff member who came through Cloudflare Access", async () => {
    const matt = await staffMember("owner", "Matt");
    const me = await admin<Body>(matt, "GET", "/me");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ role: "owner", staff: { email: matt.email, name: "Matt" } });
    expect(me.body.permissions).toContain("staff:manage");
  });

  it("refuses everyone who isn't staff, on every admin route", async () => {
    const nobody: Who = { email: `nobody-${crypto.randomUUID().slice(0, 8)}@example.test`, id: "" };
    for (const [method, path, body] of ROUTES) {
      const { status, body: problem } = await admin<Body>(nobody, method, path, body);
      expect(`${method} ${path} ${status}`).toBe(`${method} ${path} 403`);
      expect(problem.code).toBe("forbidden");
      expect(problem.hint).toBeTruthy();
    }
    const form = new FormData();
    form.append("file", new Blob(["name,suburb,state,postcode\n"]), "salons.csv");
    expect((await admin(nobody, "POST", "/directory/import", form)).status).toBe(403);
  });

  it("turns away a request with no Access token, or one Cloudflare didn't sign", async () => {
    const matt = await staffMember("owner", "Matt");
    const tokens = [
      null,
      "not-a-token",
      await accessToken(matt.email, { key: impostor.privateKey as CryptoKey }),
      await accessToken(matt.email, { audience: "another-app" }),
      await accessToken(matt.email, { issuer: "https://evil.cloudflareaccess.com" }),
    ];
    for (const token of tokens) {
      const response = await call(
        "/admin/v1/me",
        {
          headers: { Origin: ADMIN_ORIGIN, ...(token ? { "Cf-Access-Jwt-Assertion": token } : {}) },
        },
        ACCESS,
      );
      const body = (await response.json()) as Body;
      expect(response.status).toBe(403);
      expect(body.hint).toMatch(/Cloudflare Access/);
    }
  });

  it("needs no account or session: a website cookie gets nowhere", async () => {
    const matt = await staffMember("owner", "Matt");
    const { person } = createTestApp();
    const someone = await person("Matt", { email: matt.email });
    const cookieOnly = await call(
      "/admin/v1/me",
      { headers: { Cookie: someone.cookie, Origin: ADMIN_ORIGIN } },
      ACCESS,
    );
    expect(cookieOnly.status).toBe(403);
  });

  it("names the address Access let in that isn't staff, and matches it whatever its capitals", async () => {
    const eve = { email: `eve-${crypto.randomUUID().slice(0, 8)}@example.test`, id: "" };
    const refused = await admin<Body>(eve, "GET", "/users");
    expect(refused.body.detail).toBe(`${eve.email} is not staff`);
    const matt = await staffMember("owner", "Matt");
    expect((await admin({ email: matt.email.toUpperCase() }, "GET", "/me")).status).toBe(200);
  });

  it("refuses a change that didn't come from the admin portal", async () => {
    const matt = await staffMember("owner", "Matt");
    const send = async (origin?: string) =>
      (
        await call(
          "/admin/v1/directory/listings?dry_run=true",
          {
            method: "POST",
            headers: {
              "Cf-Access-Jwt-Assertion": await accessToken(matt.email),
              "Content-Type": "application/json",
              ...(origin ? { Origin: origin } : {}),
            },
            body: JSON.stringify({
              name: "Origin Hair",
              suburb: "Glebe",
              state: "NSW",
              postcode: "2037",
            }),
          },
          ACCESS,
        )
      ).status;
    expect(await send("https://evil.example")).toBe(403);
    expect(await send()).toBe(403);
    expect(await send(APP_ORIGIN)).toBe(403);
    expect(await send(ADMIN_ORIGIN)).toBe(201);
  });

  it("records when a staff member last used the portal", async () => {
    const matt = await staffMember("owner", "Matt");
    await admin(matt, "GET", "/me");
    const row = await withDb((db) => backOffice(db).staff.find(matt.id));
    expect(row?.lastSeenAt).toBeInstanceOf(Date);
  });

  it("stays shut in production without Access settings", async () => {
    const matt = await staffMember("owner", "Matt");
    const response = await call(
      "/admin/v1/me",
      { headers: { "X-Local-Staff": matt.email } },
      { ENVIRONMENT: "production", ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" },
    );
    expect(response.status).toBe(500);
  });

  it("lets a developer say who they are in local development only", async () => {
    const matt = await staffMember("owner", "Matt");
    const local = { ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" };
    expect(
      (await call("/admin/v1/me", { headers: { "X-Local-Staff": matt.email } }, local)).status,
    ).toBe(200);
    expect((await call("/admin/v1/me", {}, local)).status).toBe(403);
    expect(
      (await call("/admin/v1/me", { headers: { "X-Local-Staff": matt.email } }, ACCESS)).status,
    ).toBe(403);
    expect((await call("/admin/v1/local-staff", {}, ACCESS)).status).toBe(404);
    expect(
      (await call("/admin/v1/local-staff", {}, { ENVIRONMENT: "production", ...local })).status,
    ).toBe(404);
    const list = (await (await call("/admin/v1/local-staff", {}, local)).json()) as {
      data: { email: string }[];
    };
    expect(list.data.map((row) => row.email)).toContain(matt.email);
  });

  it("is left out of the public API reference", async () => {
    const response = await call("/v1/openapi.json");
    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      paths: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };
    expect(Object.keys(document.paths).filter((path) => path.startsWith("/admin"))).toEqual([]);
    expect(
      Object.keys(document.components?.schemas ?? {}).filter((n) => n.startsWith("Admin")),
    ).toEqual([]);
  });
});

describe("staff roles", () => {
  it("lets every role read, and only the right roles change things", async () => {
    const changes = (who: Who) =>
      Promise.all([
        admin(who, "POST", `/users/${some.user}/flags?dry_run=true`, { reason: "Testing" }),
        admin(who, "POST", `/salons/${some.salon}/credits?dry_run=true`, {
          delta: 1,
          reason: "Testing",
        }),
        admin(who, "POST", `/jobs/${some.job}/feature?dry_run=true`, { featured: true }),
        admin(who, "DELETE", `/users/${some.user}?dry_run=true`, {}),
        admin(who, "DELETE", `/salons/${some.salon}?dry_run=true`, {}),
        admin(who, "GET", "/staff"),
      ]);
    // 404: allowed in, then nothing with that ID.
    const statuses = async (who: Who) => (await changes(who)).map((r) => r.status);

    const readonly = await staffMember("readonly");
    for (const path of [
      "/overview",
      "/users",
      "/salons",
      "/jobs",
      "/payments",
      "/audit-log?limit=1",
    ]) {
      expect((await admin(readonly, "GET", path)).status).toBe(200);
    }
    expect((await admin(readonly, "GET", "/checks")).status).toBe(403);
    expect(await statuses(readonly)).toEqual([403, 403, 403, 403, 403, 403]);
    expect(await statuses(await staffMember("support"))).toEqual([404, 404, 404, 403, 403, 403]);
    expect(await statuses(await staffMember("owner"))).toEqual([404, 404, 404, 404, 404, 200]);
  });

  it("says which permission is missing", async () => {
    const who = await staffMember("readonly");
    const { body } = await admin<Body>(who, "POST", `/users/${some.user}/ban`, {
      reason: "Spam ads",
    });
    expect(body.detail).toBe("Your staff role (readonly) does not include users:ban");
    expect(body.hint).toBeTruthy();
  });
});

describe("overview", () => {
  it("counts people, salons, jobs and what's waiting", async () => {
    const matt = await staffMember("readonly");
    const { status, body } = await admin<Body & { queues: Body; salons: Body; newest: unknown[] }>(
      matt,
      "GET",
      "/overview",
    );
    expect(status).toBe(200);
    for (const key of [
      "seekers",
      "id_verified_seekers",
      "employers",
      "live_jobs",
      "signups_week",
      "active_plans",
      "revenue_cents",
    ]) {
      expect(typeof body[key]).toBe("number");
    }
    expect(body.salons).toMatchObject({ total: expect.any(Number), claimed: expect.any(Number) });
    expect(body.queues).toMatchObject({
      pending_checks: expect.any(Number),
      pending_claims: expect.any(Number),
    });
    expect(Array.isArray(body.newest)).toBe(true);
    const queues = await admin<Body>(matt, "GET", "/queues");
    expect(Object.keys(queues.body).sort()).toEqual([
      "pending_abn",
      "pending_checks",
      "pending_claims",
    ]);
  });
});

describe("staff", () => {
  type Member = {
    id: string;
    email: string;
    role: string;
    is_you: boolean;
    added_by: string | null;
  };

  it("lets an owner add someone, and they are staff at once", async () => {
    const matt = await staffMember("owner", "Matt");
    const email = `Dana-${crypto.randomUUID().slice(0, 8)}@Staff.test`;
    const added = await admin<Member & Body>(matt, "POST", "/staff", {
      name: "Dana Whitlock",
      email,
      role: "support",
      reason: "Joining to handle support",
      confirmation: SKIP,
    });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      email: email.toLowerCase(),
      role: "support",
      added_by: "Matt",
    });

    const dana = { email: email.toLowerCase() };
    expect((await admin<Body>(dana, "GET", "/me")).body).toMatchObject({ role: "support" });
    expect((await admin(dana, "GET", "/staff")).status).toBe(403);

    const again = await admin(matt, "POST", "/staff", {
      name: "Dana",
      email,
      role: "readonly",
      reason: "A second time",
      confirmation: SKIP,
    });
    expect(again.status).toBe(409);

    const audit = await admin<{ data: Body[] }>(
      matt,
      "GET",
      `/audit-log?actor_type=staff&target=${added.body.id}`,
    );
    expect(audit.body.data[0]).toMatchObject({
      action: "staff.added",
      actor_name: "Matt",
      target_id: added.body.id,
    });
  });

  it("changes a role and removes someone, confirmed and with a reason", async () => {
    const matt = await staffMember("owner", "Matt");
    const sam = await staffMember("readonly", "Sam");
    const id = encodeId("staff", sam.id);

    expect(
      (await admin(matt, "PATCH", `/staff/${id}`, { role: "support", reason: "Taking on support" }))
        .status,
    ).toBe(403);
    const changed = await admin<Member>(matt, "PATCH", `/staff/${id}`, {
      role: "support",
      reason: "Taking on support",
      confirmation: SKIP,
    });
    expect(changed.body.role).toBe("support");
    expect((await admin<Body>(sam, "GET", "/me")).body.role).toBe("support");

    const removed = await admin(matt, "DELETE", `/staff/${id}`, {
      reason: "Left",
      confirmation: SKIP,
    });
    expect(removed.status).toBe(200);
    expect((await admin(sam, "GET", "/me")).status).toBe(403);
  });

  it("stops you removing yourself or changing your own role", async () => {
    const matt = await staffMember("owner", "Matt");
    const mine = encodeId("staff", matt.id);
    const lower = await admin<Body>(matt, "PATCH", `/staff/${mine}`, {
      role: "readonly",
      reason: "Oops",
      confirmation: SKIP,
    });
    expect(lower.status).toBe(403);
    expect(
      (await admin(matt, "DELETE", `/staff/${mine}`, { reason: "Oops", confirmation: SKIP }))
        .status,
    ).toBe(403);
  });

  it("never leaves the portal without an owner", async () => {
    const matt = await staffMember("owner", "Matt");
    const undo = new Error("undo");
    await withDb(async (db) => {
      await db
        .transaction(async (tx) => {
          await tx
            .update(schema.staff)
            .set({ removedAt: new Date() })
            .where(and(eq(schema.staff.role, "owner"), ne(schema.staff.id, matt.id)));
          const data = backOffice(tx as unknown as typeof db).staff;
          const row = await data.find(matt.id);
          if (!row) throw new Error("Matt should be staff");
          await expect(data.remove(row, undefined, system)).rejects.toBeInstanceOf(LastOwnerError);
          throw undo;
        })
        .catch((error) => {
          if (error !== undo) throw error;
        });
    });
  });
});

describe("audit log", () => {
  type Page = {
    data: { id: string; action: string; actor_name: string }[];
    next_cursor: string | null;
  };

  it("filters by text, actor, age and target, and pages without repeating", async () => {
    const priya = await staffMember("owner", `Priya-${crypto.randomUUID().slice(0, 6)}`);
    const sam = await staffMember("readonly");
    await admin(priya, "PATCH", `/staff/${encodeId("staff", sam.id)}`, {
      role: "support",
      reason: "More to do",
      confirmation: SKIP,
    });
    const mine = await admin<Page>(
      priya,
      "GET",
      `/audit-log?actor_type=staff&days=7&q=${encodeURIComponent(priya.name)}`,
    );
    expect(mine.body.data.map((e) => e.action)).toEqual(["staff.role_changed"]);
    expect(
      (
        await admin<Page>(
          priya,
          "GET",
          `/audit-log?actor_type=user&q=${encodeURIComponent(priya.name)}`,
        )
      ).body.data,
    ).toEqual([]);

    const first = await admin<Page>(priya, "GET", "/audit-log?limit=2");
    const second = await admin<Page>(
      priya,
      "GET",
      `/audit-log?limit=2&cursor=${first.body.next_cursor}`,
    );
    const ids = [...first.body.data, ...second.body.data].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((await admin(priya, "GET", "/audit-log?target=nope")).status).toBe(400);
    expect(decodeId("auditEvent", ids[0] as string)).toBeTruthy();
  });
});
