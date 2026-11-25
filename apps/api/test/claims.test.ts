import { claims, salonsFor } from "@salonstaff/db";
import { decodeId, encodeId, uuidv7 } from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { postJob, randomAbn, salonOwner, testSuburb, uid } from "./fixtures";
import { createTestApp, query, withDb } from "./helpers";

async function listing(options: { email?: string; abn?: string | null } = {}) {
  return withDb((db) =>
    salonsFor(db).addListing(
      {
        name: `Listing ${uid()}`,
        suburb: testSuburb(),
        state: "QLD",
        postcode: "4005",
        abn: options.abn === undefined ? randomAbn() : options.abn,
        email: options.email ?? null,
        phone: "0730001111",
      },
      { type: "system" },
    ),
  );
}

const claimBody = (abn: string, method: "email" | "review" = "email") => ({
  abn,
  contactName: "Clare Claimant",
  phone: "0412000111",
  method,
});

interface Claim {
  id: string;
  status: string;
  sentTo: string | null;
}

describe("claiming a directory listing", () => {
  it("by a link to the listing's email", async () => {
    const app = createTestApp();
    const email = `hello-${uid()}@listed.test`;
    const salon = await listing({ email });
    const salonId = encodeId("salon", salon.id);

    const claimant = await app.person("Claimant");
    const wrongAbn = await claimant.api<{ code: string }>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(randomAbn()),
    );
    expect(wrongAbn.status).toBe(409);

    const started = await claimant.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(salon.abn as string),
    );
    expect(started.status).toBe(201);
    expect(started.body.status).toBe("pending_email");
    expect(started.body.sentTo).toMatch(/^he•+@listed\.test$/);
    const message = app.sent.find((m) => m.to === email);
    expect(message?.subject).toContain("Confirm you manage");
    const token = new URL(message?.text.match(/https?:\/\/\S+/)?.[0] as string).searchParams.get(
      "token",
    ) as string;
    // Only the hash is stored.
    const stored = await query<{ token_hash: string }>(
      sql`select token_hash from salon_claims where salon_id = ${salon.id}`,
    );
    expect(stored[0]?.token_hash).not.toContain(token);

    // Someone else holding the link can't use it.
    const stranger = await app.person("Stranger");
    expect((await stranger.api("POST", `/v1/claims/verify/${token}`)).status).toBe(403);
    expect((await claimant.api("POST", "/v1/claims/verify/not-a-real-token")).status).toBe(400);

    const confirmed = await claimant.api<{
      claim: Claim;
      salon: { id: string; founding: boolean; entitlement: { via: string } };
    }>("POST", `/v1/claims/verify/${token}`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.claim.status).toBe("approved");
    expect(confirmed.body.salon.id).toBe(salonId);
    expect(confirmed.body.salon.entitlement.via).toBe("free_period");
    const me = await claimant.api<{ role: string; salon: { id: string } }>("GET", "/v1/me");
    expect(me.body).toMatchObject({ role: "employer", salon: { id: salonId } });
    // Single use.
    expect((await claimant.api("POST", `/v1/claims/verify/${token}`)).status).toBe(400);
    // Claimed now: nobody else can start one, and it can post jobs.
    expect(
      (await stranger.api("POST", `/v1/salons/${salonId}/claims`, claimBody(salon.abn as string)))
        .status,
    ).toBe(409);
    await postJob(claimant, { suburb: salon.suburb, state: "QLD", postcode: "4005" });
    const page = await claimant.api<{ claimable: boolean; jobs: unknown[] }>(
      "GET",
      `/v1/salons/by-path?path=/salons/qld/${salon.suburbSlug}/${salon.slug}`,
    );
    expect(page.body.claimable).toBe(false);
    expect(page.body.jobs).toHaveLength(1);
  });

  it("by staff review, which the admin portal approves or rejects", async () => {
    const app = createTestApp();
    // No email on the listing: review is the only way.
    const salon = await listing({ abn: null });
    const salonId = encodeId("salon", salon.id);
    const first = await app.person("First");
    const second = await app.person("Second");
    const a = await first.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(randomAbn()),
    );
    expect(a.body).toMatchObject({ status: "pending_review", sentTo: null });
    const b = await second.api<Claim>(
      "POST",
      `/v1/salons/${salonId}/claims`,
      claimBody(randomAbn()),
    );
    expect((await first.api<Claim>("GET", `/v1/salons/${salonId}/claims/mine`)).body.id).toBe(
      a.body.id,
    );

    const staffId = uuidv7();
    const decision = await withDb((db) =>
      claims(db).approve(decodeId("claim", a.body.id) as string, staffId, "Checked the ABN"),
    );
    expect(decision.claim.status).toBe("approved");
    expect(decision.salon.ownerId).not.toBeNull();
    expect(decision.contact?.email).toBe(first.email);
    // The other open claim on it is closed.
    expect((await second.api<Claim>("GET", `/v1/salons/${salonId}/claims/mine`)).body.status).toBe(
      "rejected",
    );
    await expect(
      withDb((db) => claims(db).approve(decodeId("claim", b.body.id) as string, staffId)),
    ).rejects.toThrow(/already been decided/);
    const audit = await query<{ actor_type: string; actor_id: string }>(
      sql`select actor_type, actor_id from audit_log where action = 'claim.approved' and target_id = ${decodeId("claim", a.body.id)}`,
    );
    expect(audit).toEqual([{ actor_type: "staff", actor_id: staffId }]);

    const other = await listing({ email: `x-${uid()}@listed.test` });
    const third = await app.person("Third");
    const c = await third.api<Claim>(
      "POST",
      `/v1/salons/${encodeId("salon", other.id)}/claims`,
      claimBody(other.abn as string),
    );
    expect(c.body.status).toBe("pending_email");
    // Can't reach the inbox: switch to review. The link stops working.
    const switched = await third.api<Claim>("POST", `/v1/claims/${c.body.id}/review`);
    expect(switched.body.status).toBe("pending_review");
    const rejected = await withDb((db) =>
      claims(db).reject(decodeId("claim", c.body.id) as string, staffId, "Couldn't confirm"),
    );
    expect(rejected.claim).toMatchObject({ status: "rejected", decisionNote: "Couldn't confirm" });
    expect((await third.api<{ role: string }>("GET", "/v1/me")).body.role).toBe("seeker");
  });

  it("refuses a person who already manages a salon", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const salon = await listing();
    const refused = await owner.api<{ code: string; detail: string }>(
      "POST",
      `/v1/salons/${encodeId("salon", salon.id)}/claims`,
      claimBody(salon.abn as string),
    );
    expect(refused.status).toBe(409);
    expect(refused.body.detail).toContain("already manages");
  });

  it("returns a claimed listing to the directory when its owner deletes their account", async () => {
    const app = createTestApp();
    const salon = await listing({ abn: null });
    const person = await app.person("Departing");
    const started = await person.api<Claim>(
      "POST",
      `/v1/salons/${encodeId("salon", salon.id)}/claims`,
      claimBody(randomAbn()),
    );
    await withDb((db) =>
      claims(db).approve(decodeId("claim", started.body.id) as string, uuidv7()),
    );
    expect((await person.api("DELETE", "/v1/me")).status).toBe(200);
    const rows = await query<{ owner_id: string | null }>(
      sql`select owner_id from salons where id = ${salon.id}`,
    );
    expect(rows).toEqual([{ owner_id: null }]);
  });
});
