import { env } from "cloudflare:test";
import { schema } from "@salonstaff/db";
import { encodeId, formatAbn } from "@salonstaff/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestApp, withDb } from "./helpers";
import { admin, auditFor, SKIP, seedJob, seedSalon, staffMember, testAbn, userIdOf } from "./staff";

type Body = Record<string, unknown>;
type Salon = {
  id: string;
  name: string;
  status: string;
  owner: { id: string } | null;
  live_jobs: number;
  abn_status: string;
};
type Page<T> = { data: T[]; next_cursor: string | null };
const { call, person } = createTestApp();
const id = (salon: { id: string }) => encodeId("salon", salon.id);
/** The public jobs feed's answer to a search, as text. */
const listed = async (q: string) =>
  JSON.stringify(await (await call(`/v1/jobs?q=${encodeURIComponent(q)}`)).json());

describe("finding salons", () => {
  it("searches by name, suburb, ABN and owner email, and filters", async () => {
    const support = await staffMember("support");
    const owner = await person("Olive", { role: "employer" });
    const abn = testAbn();
    const salon = await seedSalon({
      ownerId: await userIdOf(owner.email),
      abn,
      abnStatus: "pending",
    });
    await seedJob(salon.id);
    for (const q of [salon.name, salon.suburb, formatAbn(abn), owner.email]) {
      const found = await admin<Page<Salon>>(support, "GET", `/salons?q=${encodeURIComponent(q)}`);
      expect(found.body.data.map((s) => s.id)).toEqual([id(salon)]);
      expect(found.body.data[0]).toMatchObject({ live_jobs: 1, abn_status: "pending" });
    }
    const unclaimed = await admin<Page<Salon>>(
      support,
      "GET",
      `/salons?q=${encodeURIComponent(salon.name)}&claimed=unclaimed`,
    );
    expect(unclaimed.body.data).toEqual([]);
  });

  it("shows a salon's entitlement, jobs, payments and claims", async () => {
    const support = await staffMember("readonly");
    const salon = await seedSalon({
      freeUntil: new Date(Date.now() + 86_400_000),
      listingCredits: 2,
    });
    await seedJob(salon.id);
    await withDb((db) =>
      db.insert(schema.payments).values({
        salonId: salon.id,
        kind: "single_listing",
        amountCents: 4900,
        provider: "mock",
        status: "paid",
      }),
    );
    const { status, body } = await admin<Body & { jobs: Body[]; payments: Body[] }>(
      support,
      "GET",
      `/salons/${id(salon)}`,
    );
    expect(status).toBe(200);
    expect(body.entitlement).toEqual({ ok: true, via: "free_period", reason: null });
    expect(body.listing_credits).toBe(2);
    expect(body.jobs[0]).toMatchObject({ status: "live", applicants: 0 });
    expect(body.payments[0]).toMatchObject({ amount_cents: 4900, status: "paid" });
  });
});

describe("salon status", () => {
  it("suspends with a reason and a passkey, hides its jobs, and reinstates", async () => {
    const support = await staffMember("support");
    const salon = await seedSalon();
    const job = await seedJob(salon.id);
    const path = `/salons/${id(salon)}/status`;
    expect(await listed(job.title)).toContain(job.title);

    expect(
      (await admin(support, "POST", path, { status: "suspended", confirmation: SKIP })).status,
    ).toBe(400);
    expect(
      (await admin<Body>(support, "POST", path, { status: "suspended", reason: "Scam ads" })).body
        .code,
    ).toBe("confirmation_required");
    const suspended = await admin<Salon>(support, "POST", path, {
      status: "suspended",
      reason: "Scam ads",
      confirmation: SKIP,
    });
    expect(suspended.body.status).toBe("suspended");
    expect(await auditFor(salon.id, "salon.suspended")).toHaveLength(1);

    expect(await listed(job.title)).not.toContain(job.title);

    const back = await admin<Salon>(support, "POST", path, { status: "active" });
    expect(back.body.status).toBe("active");
    expect(await listed(job.title)).toContain(job.title);
    expect(await auditFor(salon.id, "salon.reinstated")).toHaveLength(1);
  });

  it("deletes a salon only for owners, with a passkey, and its logo goes too", async () => {
    const owner = await staffMember("owner");
    const support = await staffMember("support");
    const logo = `test-${crypto.randomUUID()}.png`;
    await env.MEDIA.put(logo, "logo");
    const salon = await seedSalon({ logoKey: logo });
    await seedJob(salon.id);
    expect(
      (await admin(support, "DELETE", `/salons/${id(salon)}`, { confirmation: SKIP })).status,
    ).toBe(403);
    expect(
      (await admin(owner, "DELETE", `/salons/${id(salon)}`, { confirmation: SKIP })).status,
    ).toBe(200);
    expect(await env.MEDIA.get(logo)).toBeNull();
    expect((await admin(owner, "GET", `/salons/${id(salon)}`)).status).toBe(404);
    expect(await auditFor(salon.id, "salon.deleted")).toHaveLength(1);
  });
});

describe("billing levers", () => {
  it("gives and takes credits, never below zero, with a reason", async () => {
    const support = await staffMember("support");
    const salon = await seedSalon({ listingCredits: 1 });
    const path = `/salons/${id(salon)}/credits`;
    expect((await admin(support, "POST", path, { delta: 3 })).status).toBe(400);
    expect((await admin(support, "POST", path, { delta: 101, reason: "Too many" })).status).toBe(
      400,
    );
    expect(
      (await admin<Body>(support, "POST", path, { delta: 3, reason: "Goodwill" })).body
        .listing_credits,
    ).toBe(4);
    expect(
      (await admin<Body>(support, "POST", path, { delta: -10, reason: "Refunded" })).body
        .listing_credits,
    ).toBe(0);
    const audit = await auditFor(salon.id, "salon.credits_changed");
    expect(audit.map((row) => row.reason)).toEqual(["Goodwill", "Refunded"]);
    expect(audit[0]).toMatchObject({ before: { credits: 1 }, after: { credits: 4, delta: 3 } });
  });

  it("extends and ends the free period, and switches founding pricing", async () => {
    const support = await staffMember("support");
    const salon = await seedSalon();
    const extended = await admin<{ free_until: string }>(
      support,
      "POST",
      `/salons/${id(salon)}/free-period`,
      { days: 30 },
    );
    expect(new Date(extended.body.free_until).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86_400_000,
    );
    const ended = await admin<{ free_until: string }>(
      support,
      "POST",
      `/salons/${id(salon)}/free-period`,
      { end: true },
    );
    expect(new Date(ended.body.free_until).getTime()).toBeLessThanOrEqual(Date.now());
    expect(
      (await admin<Body>(support, "POST", `/salons/${id(salon)}/founding`, { founding: true })).body
        .founding,
    ).toBe(true);
    const actions = (await auditFor(salon.id)).map((row) => row.action);
    expect(actions).toEqual([
      "salon.free_period_extended",
      "salon.free_period_ended",
      "salon.founding_on",
    ]);
  });

  it("checks an ABN, and detaches an owner", async () => {
    const support = await staffMember("support");
    const owner = await person("Olive", { role: "employer" });
    const salon = await seedSalon({
      ownerId: await userIdOf(owner.email),
      abn: testAbn(),
      abnStatus: "pending",
      claimedAt: new Date(),
    });
    expect(
      (await admin<Salon>(support, "POST", `/salons/${id(salon)}/abn`, { status: "verified" })).body
        .abn_status,
    ).toBe("verified");
    const unclaimed = await admin<Salon & { source: string }>(
      support,
      "POST",
      `/salons/${id(salon)}/unclaim`,
    );
    expect(unclaimed.body).toMatchObject({ owner: null, source: "directory" });
    expect((await admin(support, "POST", `/salons/${id(salon)}/unclaim`)).status).toBe(409);
    const noAbn = await seedSalon();
    expect(
      (await admin(support, "POST", `/salons/${id(noAbn)}/abn`, { status: "verified" })).status,
    ).toBe(409);
  });
});

describe("the directory", () => {
  it("adds one listing, unclaimed, and refuses it twice", async () => {
    const support = await staffMember("support");
    const name = `Willow & Ash ${crypto.randomUUID().slice(0, 6)}`;
    const listing = {
      name,
      suburb: "Surry Hills",
      state: "NSW",
      postcode: "2010",
      email: "Hello@Willow.example",
    };
    const added = await admin<Salon & { path: string; source: string }>(
      support,
      "POST",
      "/directory/listings",
      listing,
    );
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ owner: null, source: "directory" });
    expect(added.body.path).toMatch(/^\/salons\/nsw\/surry-hills\/willow-and-ash-/);
    expect((await admin(support, "POST", "/directory/listings", listing)).status).toBe(409);
    expect(
      (
        await admin(support, "POST", "/directory/listings", {
          ...listing,
          name: `${name} 2`,
          abn: "12345678901",
        })
      ).status,
    ).toBe(400);
  });

  it("imports a CSV and reports what it added, skipped and why", async () => {
    const support = await staffMember("support");
    const t = crypto.randomUUID().slice(0, 6);
    const suburb = `Fitzroy ${t}`;
    const abn = testAbn();
    const csv = [
      "name,suburb,state,postcode,address,phone,email,website,instagram,abn,about",
      `The Fade Room ${t},${suburb},VIC,3065,"1 Smith St, Fitzroy",0390000000,fade@example.com,,@faderoom,${abn},"Barbers, since 2010"`,
      `The Fade Room ${t},${suburb},VIC,3065,,,,,,,`,
      `Glow ${t},${suburb},vic,3065,,,,,,,`,
      `Glow Two ${t},${suburb},XYZ,3065,,,,,,,`,
      `Bad Postcode ${t},${suburb},VIC,30,,,,,,,`,
      `Bad ABN ${t},${suburb},VIC,3065,,,,,,12345678901,`,
      `Bad Email ${t},${suburb},VIC,3065,,,not-an-email,,,,`,
      `Glow ${t},${suburb},VIC,3065,,,,,,,`,
    ].join("\n");
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "salons.csv");
    const report = await admin<{
      added: number;
      duplicates: number;
      errors: { row: number; message: string }[];
    }>(support, "POST", "/directory/import", form);
    expect(report.status).toBe(200);
    expect(report.body.added).toBe(2);
    expect(report.body.duplicates).toBe(2);
    expect(report.body.errors.map((e) => e.row)).toEqual([5, 6, 7, 8]);

    const rows = await withDb((db) =>
      db.select().from(schema.salons).where(eq(schema.salons.suburb, suburb)),
    );
    expect(rows.map((r) => r.name).sort()).toEqual([`Glow ${t}`, `The Fade Room ${t}`]);
    const fade = rows.find((r) => r.abn === abn);
    expect(fade).toMatchObject({
      source: "directory",
      ownerId: null,
      instagram: "faderoom",
      // An imported ABN isn't queued for staff; a claim checks it.
      abnStatus: "not_started",
      address: "1 Smith St, Fitzroy",
    });

    // The same file again adds nothing.
    const again = new FormData();
    again.append("file", new Blob([csv], { type: "text/csv" }), "salons.csv");
    expect(
      (await admin<{ added: number }>(support, "POST", "/directory/import", again)).body.added,
    ).toBe(0);

    const bad = new FormData();
    bad.append("file", new Blob(["title,town\nx,y\n"]), "wrong.csv");
    expect((await admin(support, "POST", "/directory/import", bad)).status).toBe(400);
  });
});

describe("jobs", () => {
  type Job = { id: string; status: string; featured: boolean; paid_via: string | null };

  it("features, takes down and relists a job, each audited", async () => {
    const support = await staffMember("support");
    const salon = await seedSalon();
    const job = await seedJob(salon.id);
    const jobId = encodeId("job", job.id);

    const found = await admin<Page<Job>>(
      support,
      "GET",
      `/jobs?q=${encodeURIComponent(job.title)}&status=live`,
    );
    expect(found.body.data.map((j) => j.id)).toEqual([jobId]);

    expect(
      (await admin<Job>(support, "POST", `/jobs/${jobId}/feature`, { featured: true })).body
        .featured,
    ).toBe(true);
    expect((await admin(support, "POST", `/jobs/${jobId}/take-down`, {})).status).toBe(400);
    expect(
      (await admin<Job>(support, "POST", `/jobs/${jobId}/take-down`, { reason: "Scam" })).body
        .status,
    ).toBe("closed");
    expect(
      (await admin(support, "POST", `/jobs/${jobId}/take-down`, { reason: "Scam" })).status,
    ).toBe(409);
    const relisted = await admin<Job>(support, "POST", `/jobs/${jobId}/relist`);
    expect(relisted.body).toMatchObject({ status: "live", paid_via: "staff" });

    const actions = (await auditFor(job.id)).map((row) => row.action);
    expect(actions).toEqual(["job.featured", "job.taken_down", "job.relisted"]);
    expect((await auditFor(job.id, "job.taken_down"))[0]?.reason).toBe("Scam");
  });

  it("lists payments", async () => {
    const readonly = await staffMember("readonly");
    const salon = await seedSalon();
    await withDb((db) =>
      db.insert(schema.payments).values({
        salonId: salon.id,
        kind: "salon_plan",
        amountCents: 9900,
        provider: "mock",
        status: "paid",
      }),
    );
    const { status, body } = await admin<Page<{ salon: { name: string } }>>(
      readonly,
      "GET",
      "/payments?limit=100",
    );
    expect(status).toBe(200);
    expect(body.data.some((p) => p.salon.name === salon.name)).toBe(true);
  });
});
