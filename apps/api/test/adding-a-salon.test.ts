/**
 * Adding a salon (D-22): finding it if it's listed already, claiming it with a code sent to the
 * listing's own email or mobile, and the salon's logo and top picture.
 */
import { claims, salonsFor } from "@salonstaff/db";
import {
  CLAIM_CODE_ATTEMPTS,
  decodeId,
  encodeId,
  uuidv7,
  withinCallingHours,
} from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callTwiml } from "../src/lib/sms";
import { asSalon, form, PNG, randomAbn, salonOwner, testSuburb, uid } from "./fixtures";
import { codeFor, createTestApp, query, withDb } from "./helpers";

/** A mobile nobody else's test lists. */
const testMobile = () => `04${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const smsTo = (mobile: string) => `sms+61${mobile.slice(1)}@local.test`;

async function listing(
  options: { name?: string; email?: string | null; phone?: string; postcode?: string } = {},
) {
  return withDb((db) =>
    salonsFor(db).addListing(
      {
        name: options.name ?? `Listing ${uid()}`,
        suburb: testSuburb(),
        state: "QLD",
        postcode: options.postcode ?? "4005",
        abn: randomAbn(),
        email: options.email ?? null,
        phone: options.phone ?? "0730001111",
      },
      { type: "system" },
    ),
  );
}

const claimBody = (abn: string, method: "email" | "phone" | "call" | "review") => ({
  abn,
  contactName: "Clare Claimant",
  phone: "0412000111",
  method,
});

interface Claim {
  id: string;
  status: string;
  via: string | null;
  sentTo: string | null;
}

interface Match {
  id: string;
  name: string;
  claimed: boolean;
  yourRole: string | null;
  score: number;
}

describe("finding a listed salon", () => {
  it("offers listings with a name like theirs near the postcode, best first", async () => {
    const app = createTestApp();
    const word = `Zephyr${uid().replace(/\d/g, "q")}`;
    const exact = await listing({ name: `${word} Hair`, postcode: "4005" });
    const partial = await listing({ name: `${word} Rosa Beauty Bar`, postcode: "4005" });
    // The same name far away isn't offered.
    await listing({ name: `${word} Hair`, postcode: "6000" });
    // Nor one sharing only the common words.
    await listing({ name: "Hair Studio", postcode: "4005" });
    const person = await app.person("Adder");

    const found = await person.api<{ items: Match[] }>(
      "GET",
      `/v1/salons/matches?name=${encodeURIComponent(`${word} hair`)}&postcode=4005`,
    );
    expect(found.status).toBe(200);
    expect(found.body.items.map((m) => m.id)).toEqual([
      encodeId("salon", exact.id),
      encodeId("salon", partial.id),
    ]);
    expect(found.body.items[0]).toMatchObject({ score: 1, claimed: false, yourRole: null });

    // Signed out: no.
    expect((await app.call(`/v1/salons/matches?name=${word}`)).status).toBe(401);
  });

  it("marks the salons you're on the team of already", async () => {
    const app = createTestApp();
    const name = `Quokka ${uid().replace(/\d/g, "x")}`;
    const { owner, salon } = await salonOwner(app, { name, postcode: "4005" });
    const found = await owner.api<{ items: Match[] }>(
      "GET",
      `/v1/salons/matches?name=${encodeURIComponent(name)}&postcode=4005`,
    );
    expect(found.body.items[0]).toMatchObject({ id: salon.id, claimed: true, yourRole: "owner" });
  });
});

describe("claiming with a code", () => {
  it("shows how a listing can be claimed, masked, from its own details only", async () => {
    const app = createTestApp();
    const mobile = testMobile();
    const salon = await listing({ email: `hello-${uid()}@listed.test`, phone: mobile });
    const person = await app.person("Asker");
    const options = await person.api<{
      abnOnFile: boolean;
      methods: { method: string; sentTo: string | null }[];
    }>("GET", `/v1/salons/${encodeId("salon", salon.id)}/claim-options`);
    expect(options.body.abnOnFile).toBe(true);
    expect(options.body.methods).toEqual([
      {
        method: "email",
        sentTo: expect.stringMatching(/^he•+@listed\.test$/),
        unavailable: null,
      },
      { method: "phone", sentTo: `04•• ••• ${mobile.slice(-3)}`, unavailable: null },
      // A mobile can take a call too (in calling hours).
      {
        method: "call",
        sentTo: `04•• ••• ${mobile.slice(-3)}`,
        unavailable: withinCallingHours("QLD", new Date()) ? null : expect.any(String),
      },
      { method: "review", sentTo: null, unavailable: null },
    ]);
    // A landline can't take a text, but can take a call.
    const landline = await listing({ phone: "0730001111" });
    const fewer = await person.api<{ methods: { method: string }[] }>(
      "GET",
      `/v1/salons/${encodeId("salon", landline.id)}/claim-options`,
    );
    expect(fewer.body.methods.map((m) => m.method)).toEqual(["call", "review"]);
    const refused = await person.api(
      "POST",
      `/v1/salons/${encodeId("salon", landline.id)}/claims`,
      claimBody(landline.abn as string, "phone"),
    );
    expect(refused.status).toBe(400);
  });

  it("by a code texted to the listing's mobile", async () => {
    const app = createTestApp();
    const mobile = testMobile();
    const salon = await listing({ phone: mobile });
    const salonId = encodeId("salon", salon.id);
    const claimant = await app.person("Texter");
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "phone"),
    );
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      status: "pending_email",
      via: "phone",
      sentTo: `04•• ••• ${mobile.slice(-3)}`,
    });
    const code = codeFor(app.sent, smsTo(mobile));
    // Only its hash is kept.
    const [row] = await query<{ code_hash: string }>(
      sql`select code_hash from salon_claims where id = ${decodeId("claim", started.body.id)}`,
    );
    expect(row?.code_hash).not.toContain(code);

    // Someone else can't use it.
    const stranger = await app.person("Stranger");
    expect(
      (await stranger.api("POST", `/v1/claims/${started.body.id}/code`, { code })).status,
    ).toBe(404);

    const confirmed = await claimant.api<{ claim: Claim; salon: { id: string; role: string } }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code },
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.claim.status).toBe("approved");
    expect(confirmed.body.salon).toMatchObject({ id: salonId, role: "owner" });
    const audit = await query<{ actor_type: string }>(
      sql`select actor_type from audit_log where action = 'claim.approved' and target_id = ${decodeId("claim", started.body.id)}`,
    );
    expect(audit).toEqual([{ actor_type: "user" }]);
    // Used once.
    expect(
      (await claimant.api("POST", `/v1/claims/${started.body.id}/code`, { code })).status,
    ).toBe(409);
  });

  it("by a code in the email to the listing's address", async () => {
    const app = createTestApp();
    const email = `hello-${uid()}@listed.test`;
    const salon = await listing({ email });
    const claimant = await app.person("Emailer");
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${encodeId("salon", salon.id)}/claims`,
      claimBody(salon.abn as string, "email"),
    );
    expect(started.body).toMatchObject({ status: "pending_email", via: "email" });
    const message = app.sent.find((m) => m.to === email);
    expect(message?.subject).toMatch(/^\d{6} is the code to manage/);
    const code = message?.subject.slice(0, 6) as string;
    const confirmed = await claimant.api<{ claim: Claim }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code },
    );
    expect(confirmed.body.claim.status).toBe("approved");
  });

  it(`takes ${CLAIM_CODE_ATTEMPTS} wrong codes, then none; starting again is a new code`, async () => {
    const app = createTestApp();
    const mobile = testMobile();
    const salon = await listing({ phone: mobile });
    const salonId = encodeId("salon", salon.id);
    const claimant = await app.person("Guesser");
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "phone"),
    );
    const code = codeFor(app.sent, smsTo(mobile));
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i < CLAIM_CODE_ATTEMPTS; i++) {
      const attempt = await claimant.api<{ hint: string }>(
        "POST",
        `/v1/claims/${started.body.id}/code`,
        { code: wrong },
      );
      expect(attempt.status).toBe(400);
      expect(attempt.body.hint).toContain(`${CLAIM_CODE_ATTEMPTS - i} more`);
    }
    expect(
      (await claimant.api("POST", `/v1/claims/${started.body.id}/code`, { code: wrong })).status,
    ).toBe(429);
    // Even the right code, now.
    expect(
      (await claimant.api("POST", `/v1/claims/${started.body.id}/code`, { code })).status,
    ).toBe(429);

    // Not again within a few minutes…
    const tooSoon = await claimant.api(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "phone"),
    );
    expect(tooSoon.status).toBe(429);
    // …but staff can still check it.
    const review = await claimant.api<Claim>("POST", `/v1/claims/${started.body.id}/review`);
    expect(review.body.status).toBe("pending_review");

    // Starting again (later) replaces the claim, which stays as replaced and counts for the day.
    await query(
      sql`update salon_claims set created_at = now() - interval '10 minutes' where id = ${decodeId("claim", started.body.id)}`,
    );
    const again = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "phone"),
    );
    expect(again.status).toBe(201);
    const rows = await query<{ status: string; decision_note: string | null }>(
      sql`select status, decision_note from salon_claims where salon_id = ${salon.id} order by created_at`,
    );
    expect(rows).toEqual([
      { status: "rejected", decision_note: "Started again" },
      { status: "pending_email", decision_note: null },
    ]);
    const fresh = codeFor(app.sent, smsTo(mobile));
    const done = await claimant.api<{ claim: Claim }>("POST", `/v1/claims/${again.body.id}/code`, {
      code: fresh,
    });
    expect(done.body.claim.status).toBe("approved");
  });

  it("needs no ABN when a code proves it, but checks one that's given; a staff check needs one", async () => {
    const app = createTestApp();
    const mobile = testMobile();
    const salon = await listing({ phone: mobile });
    const salonId = encodeId("salon", salon.id);
    const claimant = await app.person("NoAbn");
    const { abn: _abn, ...withoutAbn } = claimBody(salon.abn as string, "phone");

    // A staff check has only the ABN to go on.
    const review = await claimant.api<{ errors: { path: string }[] }>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      { ...withoutAbn, method: "review" },
    );
    expect(review.status).toBe(400);
    expect(review.body.errors[0]?.path).toBe("abn");
    // One that's given is still checked against the listing.
    const wrong = await claimant.api("POST", `/v1/salons/${salonId}/claims`, {
      ...withoutAbn,
      abn: randomAbn(),
    });
    expect(wrong.status).toBe(409);

    const started = await claimant.api<Claim>("POST", `/v1/salons/${salonId}/claims`, {
      ...withoutAbn,
      abn: "",
    });
    expect(started.status).toBe(201);
    const code = codeFor(app.sent, smsTo(mobile));
    const done = await claimant.api<{
      claim: Claim;
      salon: { abn: string | null; abnStatus: string; entitlement: { via: string } };
    }>("POST", `/v1/claims/${started.body.id}/code`, { code });
    expect(done.body.claim.status).toBe("approved");
    // The listing keeps its own ABN, unconfirmed; the launch terms are the usual ones.
    expect(done.body.salon).toMatchObject({
      abn: salon.abn,
      abnStatus: "not_started",
      entitlement: { via: "free_period" },
    });
  });

  it("tells a listing's owners when someone else claims it by code", async () => {
    const app = createTestApp();
    const mobile = testMobile();
    const salon = await listing({ phone: mobile });
    const salonId = encodeId("salon", salon.id);
    const original = await app.person("Original");
    const first = await original.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "review"),
    );
    await withDb((db) => claims(db).approve(decodeId("claim", first.body.id) as string, uuidv7()));

    const successor = await app.person("Successor");
    const started = await successor.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "phone"),
    );
    const code = codeFor(app.sent, smsTo(mobile));
    await successor.api("POST", `/v1/claims/${started.body.id}/code`, { code });
    expect(app.sent.some((m) => m.to === original.email)).toBe(true);
  });
});

/** A landline nobody else's test lists (07, Brisbane: no daylight saving). */
const testLandline = () => `07${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
const callTo = (landline: string) => `call+61${landline.slice(1)}@local.test`;

/** Today at `hour` o'clock in Brisbane (UTC+10), for calling hours. */
function brisbaneHour(hour: number): Date {
  const today = new Date();
  today.setUTCHours(hour - 10, 0, 0, 0);
  return today;
}

describe("claiming with a call to the listing's landline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the code out in a call, in calling hours only", async () => {
    const app = createTestApp();
    const landline = testLandline();
    const salon = await listing({ phone: landline });
    const salonId = encodeId("salon", salon.id);
    const claimant = await app.person("Caller");

    // Midnight in Brisbane: no calls.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(brisbaneHour(0));
    const options = await claimant.api<{
      methods: { method: string; sentTo: string | null; unavailable: string | null }[];
    }>("GET", `/v1/salons/${salonId}/claim-options`);
    expect(options.body.methods[0]).toMatchObject({
      method: "call",
      sentTo: `07•• ••• ${landline.slice(-3)}`,
      unavailable: expect.stringContaining("8am and 8pm"),
    });
    const late = await claimant.api(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "call"),
    );
    expect(late.status).toBe(400);
    expect(app.sent.some((m) => m.to === callTo(landline))).toBe(false);

    // Midday: we call.
    vi.setSystemTime(brisbaneHour(12));
    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string, "call"),
    );
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      status: "pending_email",
      via: "call",
      sentTo: `07•• ••• ${landline.slice(-3)}`,
    });
    const call = app.sent.find((m) => m.to === callTo(landline));
    expect(call?.text).toContain("Clare Claimant asked to manage the listing");
    // Spoken digit by digit: "1 2 3, 4 5 6".
    const spoken = call?.text.match(/(\d) (\d) (\d), (\d) (\d) (\d)/);
    expect(spoken).not.toBeNull();
    const code = spoken?.slice(1).join("") as string;
    vi.useRealTimers();

    const confirmed = await claimant.api<{ claim: Claim }>(
      "POST",
      `/v1/claims/${started.body.id}/code`,
      { code },
    );
    expect(confirmed.body.claim.status).toBe("approved");
    const [decided] = await query<{ decided_by: string }>(
      sql`select decided_by from salon_claims where id = ${decodeId("claim", started.body.id)}`,
    );
    expect(decided?.decided_by).toBe("call-code");
  });
});

it("says the call's words twice, with nothing that could change the call's instructions", () => {
  const twiml = callTwiml(`Code for <Dial>Bob's & "Co"</Dial>: 1 2 3, 4 5 6.`);
  expect(twiml).not.toContain("<Dial>");
  expect(twiml.match(/Code for DialBobs {2}Co\/Dial: 1 2 3, 4 5 6\./g)).toHaveLength(2);
  expect(twiml.startsWith("<Response>")).toBe(true);
});

describe("the salon's pictures", () => {
  it("sets, replaces and removes the logo and the top picture, owners only", async () => {
    const app = createTestApp();
    const { owner, salon } = await salonOwner(app);
    const at = asSalon(owner, salon.id).at;
    const png = () => form({ file: { bytes: PNG, name: "x.png", type: "image/png" } });

    const logo = await owner.api<{ logoUrl: string | null; heroUrl: string | null }>(
      "POST",
      at("/logo"),
      png(),
    );
    expect(logo.status).toBe(200);
    expect(logo.body.logoUrl).toMatch(/\.png$/);
    expect(logo.body.heroUrl).toBeNull();
    const hero = await owner.api<{ logoUrl: string; heroUrl: string; path: string }>(
      "POST",
      at("/hero"),
      png(),
    );
    expect(hero.body.heroUrl).toMatch(/\.png$/);
    expect(hero.body.logoUrl).toBe(logo.body.logoUrl);

    // On the public page.
    const page = await app.call(`/v1/salons/by-path?path=${encodeURIComponent(hero.body.path)}`);
    const body = (await page.json()) as { salon: { logoUrl: string; heroUrl: string } };
    expect(body.salon).toMatchObject({ logoUrl: logo.body.logoUrl, heroUrl: hero.body.heroUrl });

    // Not a picture: refused.
    const text = form({
      file: { bytes: new TextEncoder().encode("hello"), name: "x.png", type: "image/png" },
    });
    expect((await owner.api("POST", at("/hero"), text)).status).toBe(415);

    // A manager can't.
    const manager = await app.person("Manager");
    await query(
      sql`insert into salon_members (salon_id, user_id, role) values (${decodeId("salon", salon.id)}, (select id from users where email = ${manager.email}), 'manager')`,
    );
    expect((await manager.api("POST", at("/logo"), png())).status).toBe(403);

    const removed = await owner.api<{ logoUrl: string | null; heroUrl: string | null }>(
      "DELETE",
      at("/hero"),
    );
    expect(removed.body).toMatchObject({ heroUrl: null, logoUrl: logo.body.logoUrl });
    const audit = await query<{ action: string }>(
      sql`select action from audit_log where target_id = ${decodeId("salon", salon.id)} and action like 'salon.%' order by occurred_at`,
    );
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["salon.logo_set", "salon.hero_set", "salon.hero_removed"]),
    );
  });
});
