import { salonsFor } from "@salonstaff/db";
import { encodeId } from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  jobInput,
  type MySalon,
  phonePerson,
  postJob,
  profileInput,
  randomAbn,
  readySeeker,
  type SalonJob,
  salonInput,
  salonOwner,
  testSuburb,
  uid,
  verifyIdentity,
} from "./fixtures";
import { createTestApp, query, withDb } from "./helpers";

describe("salon onboarding", () => {
  it("checks the ABN, makes the person an employer and starts the free period", async () => {
    const app = createTestApp();
    const person = await app.person("Founder");
    const badAbn = await person.api<{ errors: { path: string }[] }>(
      "POST",
      "/v1/employer/salons",
      salonInput({ abn: "12345678901" }),
    );
    expect(badAbn.status).toBe(400);
    expect(badAbn.body.errors[0]?.path).toBe("abn");

    const dry = await person.api("POST", "/v1/employer/salons?dry_run=true", salonInput());
    expect(dry.status).toBe(201);
    expect(
      (await person.api<{ items: unknown[] }>("GET", "/v1/employer/salons")).body.items,
    ).toEqual([]);

    const created = await person.api<MySalon & { founding: boolean; abnStatus: string }>(
      "POST",
      "/v1/employer/salons",
      salonInput({ abn: randomAbn().replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4") }),
    );
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(/^sln_/);
    expect(created.body.role).toBe("owner");
    expect(created.body.path).toMatch(/^\/salons\/nsw\/testvale-[a-z0-9]+\/test-salon-[a-z0-9]+$/);
    // No ABR_GUID in tests: the ABN waits for staff.
    expect(created.body.abnStatus).toBe("pending");
    expect(created.body.entitlement).toEqual({ ok: true, via: "free_period", reason: null });
    const freeDays = (new Date(created.body.freeUntil as string).getTime() - Date.now()) / 86400000;
    expect(Math.round(freeDays)).toBe(90);

    const me = await person.api<{ role: string; salons: { id: string; role: string }[] }>(
      "GET",
      "/v1/me",
    );
    expect(me.body.role).toBe("employer");
    expect(me.body.salons).toEqual([
      expect.objectContaining({ id: created.body.id, role: "owner" }),
    ]);
  });

  it("lets one account run several salons, each with its own jobs and launch terms", async () => {
    const app = createTestApp();
    const { owner, salon: first } = await salonOwner(app);
    const second = await owner.api<MySalon>("POST", "/v1/employer/salons", salonInput());
    expect(second.status).toBe(201);
    const mine = await owner.api<{ items: MySalon[] }>("GET", "/v1/employer/salons");
    expect(mine.body.items.map((s) => s.id)).toEqual([first.id, second.body.id]);
    expect(second.body.entitlement.via).toBe("free_period");

    const atFirst = await postJob(owner, { title: "First location stylist" });
    const atSecond = await owner.api<SalonJob>(
      "POST",
      `/v1/employer/salons/${second.body.id}/jobs`,
      { ...jobInput({ title: "Second location stylist" }), publish: true },
    );
    expect(atSecond.status).toBe(201);
    const listed = async (id: string) =>
      (
        await owner.api<{ items: SalonJob[] }>("GET", `/v1/employer/salons/${id}/jobs`)
      ).body.items.map((j) => j.id);
    expect(await listed(first.id)).toEqual([atFirst.id]);
    expect(await listed(second.body.id)).toEqual([atSecond.body.id]);
    // A job is only reachable under its own salon.
    expect(
      (await owner.api("GET", `/v1/employer/salons/${second.body.id}/jobs/${atFirst.id}`)).status,
    ).toBe(404);
  });

  it("sends the owner of a directory listing to claim it instead", async () => {
    const app = createTestApp();
    const abn = randomAbn();
    const listing = await withDb((db) =>
      salonsFor(db).addListing(
        { name: `Listed ${uid()}`, suburb: testSuburb(), state: "VIC", postcode: "3065", abn },
        { type: "system" },
      ),
    );
    const person = await app.person("Lister");
    const refused = await person.api<{ code: string; hint: string }>(
      "POST",
      "/v1/employer/salons",
      salonInput({ abn }),
    );
    expect(refused.status).toBe(409);
    expect(refused.body.hint).toContain(`/salons/vic/${listing.suburbSlug}/${listing.slug}/claim`);
  });

  it("renames with a redirect and a -2 for a clash in the same suburb", async () => {
    const app = createTestApp();
    const suburb = testSuburb();
    const name = `Clash ${uid()}`;
    const first = await salonOwner(app, { name, suburb });
    const second = await salonOwner(app, { name, suburb });
    expect(second.salon.slug).toBe(`${first.salon.slug}-2`);

    const job = await postJob(first.owner, { title: "Barber", suburb });
    const renamed = await first.owner.api<MySalon>("PATCH", first.owner.at(), {
      name: `${name} Studio`,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.slug).toBe(`${first.salon.slug}-studio`);

    const old = await app.call(`/v1/salons/by-path?path=${first.salon.path}`);
    expect(await old.json()).toEqual({ kind: "redirect", redirect: renamed.body.path });
    // The job's address carries the salon's name, so it moved too.
    const oldJob = await app.call(`/v1/jobs/by-path?path=${job.path}`);
    const moved = (await oldJob.json()) as { kind: string; redirect: string };
    expect(moved.kind).toBe("redirect");
    expect(moved.redirect).toContain("-studio");
    // The freed-up slug isn't handed to the next salon: the old address keeps redirecting.
    const third = await salonOwner(app, { name, suburb });
    expect(third.salon.slug).toBe(`${first.salon.slug}-3`);
  });

  it("clears an optional field sent blank or null, and keeps one left out", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app, {
      website: "https://example.com",
      instagram: "@testsalon",
    });
    type Details = MySalon & {
      website: string | null;
      instagram: string | null;
      about: string | null;
    };
    const cleared = await owner.api<Details>("PATCH", owner.at(), { website: "", about: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ website: null, about: null, instagram: "testsalon" });
    const again = await owner.api<Details>("PATCH", owner.at(), { instagram: null });
    expect(again.body).toMatchObject({ website: null, instagram: null });
  });
});

describe("posting and publishing", () => {
  it("publishes in the free period, then with credits, then needs a listing", async () => {
    const app = createTestApp();
    const { owner, salon } = await salonOwner(app);
    const draft = await postJob(owner, {}, false);
    expect(draft.status).toBe("draft");
    expect(draft.id).toMatch(/^job_/);

    const published = await owner.api<SalonJob & { expiresAt: string }>(
      "POST",
      owner.at(`/jobs/${draft.id}/publish`),
    );
    expect(published.body).toMatchObject({ status: "published", paidVia: "free_period" });
    const days = (new Date(published.body.expiresAt).getTime() - Date.now()) / 86400000;
    expect(Math.round(days)).toBe(30);

    // The free period is over, with one credit left.
    await query(
      sql`update salons set free_until = now() - interval '1 day', listing_credits = 1 where name = ${salon.name}`,
    );
    const second = await postJob(owner, {}, true);
    expect(second.paidVia).toBe("credit");
    expect((await owner.api<MySalon>("GET", owner.at())).body.listingCredits).toBe(0);

    // Publishing a live job again charges nothing.
    expect((await owner.api("POST", owner.at(`/jobs/${second.id}/publish`))).status).toBe(200);

    const third = await postJob(owner, {}, false);
    const refused = await owner.api<{ code: string; hint: string }>(
      "POST",
      owner.at(`/jobs/${third.id}/publish`),
    );
    expect(refused.status).toBe(402);
    expect(refused.body.code).toBe("listing_needed");
    expect(refused.body.hint).toContain("/billing/checkout");
    // Posting with `publish: true` saves nothing when it can't publish.
    const before = (await owner.api<{ items: unknown[] }>("GET", owner.at("/jobs"))).body.items
      .length;
    const refusedPost = await owner.api("POST", owner.at("/jobs"), {
      ...jobInput(),
      publish: true,
    });
    expect(refusedPost.status).toBe(402);
    expect(
      (await owner.api<{ items: unknown[] }>("GET", owner.at("/jobs"))).body.items,
    ).toHaveLength(before);

    // A mock checkout (local only) gives a credit.
    const checkout = await owner.api<{ url: string }>("POST", owner.at("/billing/checkout"), {
      kind: "single_listing",
    });
    expect(checkout.status).toBe(200);
    const ref = new URL(checkout.body.url).searchParams.get("ref") as string;
    expect((await owner.api("POST", `/v1/dev/checkout/${ref}`, { outcome: "paid" })).status).toBe(
      200,
    );
    // Fulfilling twice gives one credit.
    await owner.api("POST", `/v1/dev/checkout/${ref}`, { outcome: "paid" });
    const billing = await owner.api<{ listingCredits: number; payments: { status: string }[] }>(
      "GET",
      owner.at("/billing"),
    );
    expect(billing.body.listingCredits).toBe(1);
    expect(billing.body.payments[0]?.status).toBe("paid");
    expect(
      (await owner.api<SalonJob>("POST", owner.at(`/jobs/${third.id}/publish`))).body.paidVia,
    ).toBe("credit");
  });

  it("keeps salons to their own jobs", async () => {
    const app = createTestApp();
    const a = await salonOwner(app);
    const b = await salonOwner(app);
    const job = await postJob(a.owner);
    expect((await b.owner.api("GET", b.owner.at(`/jobs/${job.id}`))).status).toBe(404);
    expect(
      (await b.owner.api("PATCH", b.owner.at(`/jobs/${job.id}`), { title: "Hijacked job" })).status,
    ).toBe(404);
    expect((await b.owner.api("POST", b.owner.at(`/jobs/${job.id}/close`))).status).toBe(404);
    expect((await b.owner.api("GET", b.owner.at(`/jobs/${job.id}/applicants`))).status).toBe(404);
    const seeker = await app.person("NoSalon");
    expect((await seeker.api("GET", `/v1/employer/salons/${a.salon.id}/jobs`)).status).toBe(404);
    expect((await seeker.api("GET", "/v1/employer/salons/sln_nonsense")).status).toBe(404);
  });

  it("changes a job, moving its address", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner, { title: "Junior Stylist" });
    const bad = await owner.api("PATCH", owner.at(`/jobs/${job.id}`), { payMin: 50, payMax: 40 });
    expect(bad.status).toBe(400);
    const changed = await owner.api<SalonJob>("PATCH", owner.at(`/jobs/${job.id}`), {
      title: "Senior Stylist",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.path).not.toBe(job.path);
    expect(changed.body.slug).toMatch(/^senior-stylist-/);
    const old = (await (await app.call(`/v1/jobs/by-path?path=${job.path}`)).json()) as {
      redirect: string;
    };
    expect(old.redirect).toBe(changed.body.path);
  });
});

describe("applicants", () => {
  it("shows a salon only its own applicants, and marks them viewed", async () => {
    const app = createTestApp();
    const a = await salonOwner(app);
    const b = await salonOwner(app);
    const jobA = await postJob(a.owner);
    const jobB = await postJob(b.owner);
    const seeker = await readySeeker(app, "Candidate");
    const other = await readySeeker(app, "Elsewhere");
    expect((await seeker.api("POST", `/v1/jobs/${jobA.id}/apply`, {})).status).toBe(201);
    expect((await other.api("POST", `/v1/jobs/${jobB.id}/apply`, {})).status).toBe(201);

    const list = await a.owner.api<{
      job: SalonJob;
      items: {
        id: string;
        isNew: boolean;
        status: string;
        candidateId: string;
        verification: { level: number; references: { identity?: string } };
      }[];
    }>("GET", a.owner.at(`/jobs/${jobA.id}/applicants`));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const [applicant] = list.body.items;
    expect(applicant).toMatchObject({ isNew: true, status: "viewed" });
    expect(applicant?.verification.level).toBe(1);
    expect(applicant?.verification.references.identity).toMatch(/^SSV-/);
    const again = await a.owner.api<{ items: { isNew: boolean }[] }>(
      "GET",
      a.owner.at(`/jobs/${jobA.id}/applicants`),
    );
    expect(again.body.items[0]?.isNew).toBe(false);

    // A hidden profile: only the salon they applied to sees it (D-13), and how it can contact them,
    // never their address or number in the profile itself.
    expect(
      (await seeker.api("PATCH", "/v1/me/profile/settings", { visibility: "hidden" })).status,
    ).toBe(200);
    const candidateId = applicant?.candidateId as string;
    const full = await a.owner.api<{
      contact: { message: boolean; phone: boolean };
      profile: { firstName: string };
      applications: { jobId: string }[];
    }>("GET", a.owner.at(`/candidates/${candidateId}`));
    expect(full.status).toBe(200);
    expect(full.body.contact).toEqual({ message: true, phone: false });
    expect(JSON.stringify(full.body)).not.toContain(seeker.email);
    expect(full.body.applications.map((x) => x.jobId)).toEqual([jobA.id]);
    expect((await b.owner.api("GET", b.owner.at(`/candidates/${candidateId}`))).status).toBe(404);
    // Nor can a salon move another salon's applications along.
    expect(
      (
        await b.owner.api("PATCH", b.owner.at(`/applications/${applicant?.id}`), {
          status: "hired",
        })
      ).status,
    ).toBe(404);

    const shortlisted = await a.owner.api<{ status: string }>(
      "PATCH",
      a.owner.at(`/applications/${applicant?.id}`),
      { status: "shortlisted" },
    );
    expect(shortlisted.body.status).toBe("shortlisted");
    const told = app.sent.filter((m) => m.to === seeker.email);
    expect(told.map((m) => m.subject)).toEqual([
      expect.stringContaining("Update on your application"),
    ]);
    // The same status again tells nobody.
    await a.owner.api("PATCH", a.owner.at(`/applications/${applicant?.id}`), {
      status: "shortlisted",
    });
    expect(app.sent.filter((m) => m.to === seeker.email)).toHaveLength(1);
    const mine = await seeker.api<{ items: { status: string }[] }>("GET", "/v1/me/applications");
    expect(mine.body.items[0]?.status).toBe("shortlisted");
  });

  it("doesn't text people who signed up with a mobile number about their applications (D-24)", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner);
    const mobile = await phonePerson(app);
    expect((await mobile.api("PUT", "/v1/me/profile", profileInput())).status).toBe(200);
    await verifyIdentity(mobile);
    expect((await mobile.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);
    const list = await owner.api<{ items: { id: string }[] }>(
      "GET",
      owner.at(`/jobs/${job.id}/applicants`),
    );
    const before = app.sent.filter((m) => m.to === mobile.smsTo).length;
    await owner.api("PATCH", owner.at(`/applications/${list.body.items[0]?.id}`), {
      status: "interview",
    });
    // No email to send it to, and a topic's notices don't come by text: push only.
    expect(app.sent.filter((m) => m.to === mobile.smsTo)).toHaveLength(before);
    const me = await mobile.api<{ email: string | null; phoneNumber: string }>("GET", "/v1/me");
    expect(me.body).toMatchObject({ email: null, phoneNumber: mobile.phoneNumber });
  });

  it("hides banned people's applications", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner);
    const banned = await readySeeker(app, "Banned");
    const fine = await readySeeker(app, "Fine");
    await banned.api("POST", `/v1/jobs/${job.id}/apply`, {});
    await fine.api("POST", `/v1/jobs/${job.id}/apply`, {});
    const before = await owner.api<{ items: { candidateId: string }[] }>(
      "GET",
      owner.at(`/jobs/${job.id}/applicants`),
    );
    expect(before.body.items).toHaveLength(2);

    await query(
      sql`update users set suspended_at = now(), suspended_reason = 'Spam' where email = ${banned.email}`,
    );
    const after = await owner.api<{ items: unknown[]; job: { applicants: number } }>(
      "GET",
      owner.at(`/jobs/${job.id}/applicants`),
    );
    expect(after.body.items).toHaveLength(1);
    expect(after.body.job.applicants).toBe(1);
    const bannedUser = await query<{ id: string }>(
      sql`select id from users where email = ${banned.email}`,
    );
    expect(
      (
        await owner.api(
          "GET",
          owner.at(`/candidates/${encodeId("user", bannedUser[0]?.id as string)}`),
        )
      ).status,
    ).toBe(404);
    // And they're signed out.
    expect((await banned.api("GET", "/v1/me")).status).toBe(401);
  });
});
