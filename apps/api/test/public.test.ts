import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { postJob, salonOwner, testSuburb, uid } from "./fixtures";
import { createTestApp, query } from "./helpers";

const get = async <T>(app: ReturnType<typeof createTestApp>, path: string) => {
  const response = await app.call(path);
  return { status: response.status, body: (await response.json()) as T };
};

interface Landing {
  kind: "landing";
  heading: string;
  noindex: boolean;
  suburbName: string | null;
  breadcrumbs: { name: string; path: string }[];
  jobs: { items: { id: string; path: string; featured: boolean }[]; total: number };
}

describe("the job feed", () => {
  it("lists live jobs only, with paths and filters", async () => {
    const app = createTestApp();
    const suburb = testSuburb();
    const { owner } = await salonOwner(app, { suburb });
    const live = await postJob(owner, { suburb, role: "barber", title: `Barber ${uid()}` });
    const draft = await postJob(owner, { suburb }, false);
    const closed = await postJob(owner, { suburb });
    await owner.api("POST", `/v1/salon/jobs/${closed.id}/close`);
    const suburbSlug = live.path.split("/")[3];

    const feed = await get<{
      items: { id: string; path: string }[];
      total: number;
      facets: { roles: { role: string; count: number }[] };
    }>(app, `/v1/jobs?state=NSW&suburb=${suburbSlug}`);
    expect(feed.status).toBe(200);
    expect(feed.body.items.map((j) => j.id)).toEqual([live.id]);
    expect(feed.body.items[0]?.path).toBe(live.path);
    expect(feed.body.facets.roles).toEqual([{ role: "barber", count: 1 }]);
    expect(feed.body.items.map((j) => j.id)).not.toContain(draft.id);

    const byRole = await get<{ total: number }>(
      app,
      `/v1/jobs?role=colourist&suburb=${suburbSlug}`,
    );
    expect(byRole.body.total).toBe(0);
    const byText = await get<{ items: { id: string }[] }>(
      app,
      `/v1/jobs?q=${encodeURIComponent(live.title)}`,
    );
    expect(byText.body.items.map((j) => j.id)).toEqual([live.id]);
    expect((await app.call("/v1/jobs?role=wizard")).status).toBe(400);
  });

  it("hides jobs at a suspended salon or with a banned owner", async () => {
    const app = createTestApp();
    const suburb = testSuburb();
    const { owner, salon } = await salonOwner(app, { suburb });
    const job = await postJob(owner, { suburb });
    expect((await get(app, `/v1/jobs/by-path?path=${job.path}`)).status).toBe(200);
    await query(sql`update salons set status = 'suspended' where name = ${salon.name}`);
    expect((await get(app, `/v1/jobs/by-path?path=${job.path}`)).status).toBe(404);
    expect((await get(app, `/v1/salons/by-path?path=${salon.path}`)).status).toBe(404);
    await query(sql`update salons set status = 'active' where name = ${salon.name}`);
    await query(sql`update users set suspended_at = now() where email = ${owner.email}`);
    expect((await get(app, `/v1/jobs/by-path?path=${job.path}`)).status).toBe(404);
  });
});

describe("resolving public addresses", () => {
  it("answers landing pages, job ads, closed ads and 404s", async () => {
    const app = createTestApp();
    const suburb = testSuburb();
    const { owner } = await salonOwner(app, { suburb });
    const live = await postJob(owner, {
      suburb,
      role: "barber",
      title: `Fade Specialist ${uid()}`,
    });
    const closing = await postJob(owner, {
      suburb,
      role: "barber",
      title: `Weekend Barber ${uid()}`,
    });
    const [, , state, suburbSlug] = live.path.split("/");

    const place = await get<Landing>(app, `/v1/jobs/by-path?path=/jobs/${state}/${suburbSlug}`);
    expect(place.status).toBe(200);
    expect(place.body).toMatchObject({ kind: "landing", noindex: false, suburbName: suburb });
    expect(place.body.heading).toBe(`Hair and beauty jobs in ${suburb} NSW`);
    expect(place.body.jobs.total).toBe(2);

    const role = await get<Landing>(
      app,
      `/v1/jobs/by-path?path=/jobs/barber/${state}/${suburbSlug}`,
    );
    expect(role.body.heading).toBe(`Barber jobs in ${suburb} NSW`);
    expect(role.body.breadcrumbs.map((b) => b.path)).toEqual([
      "/jobs",
      "/jobs/barber",
      "/jobs/barber/nsw",
      `/jobs/barber/nsw/${suburbSlug}`,
    ]);
    const empty = await get<Landing>(
      app,
      `/v1/jobs/by-path?path=/jobs/colourist/${state}/${suburbSlug}`,
    );
    expect(empty.body).toMatchObject({ kind: "landing", noindex: true });
    expect(empty.body.jobs.total).toBe(0);
    expect((await get<Landing>(app, "/v1/jobs/by-path?path=/jobs")).body.kind).toBe("landing");

    const ad = await get<{
      kind: string;
      closed: boolean;
      noindex: boolean;
      job: { id: string; description: string };
      viewer: unknown;
    }>(app, `/v1/jobs/by-path?path=${live.path}`);
    expect(ad.body).toMatchObject({ kind: "job", closed: false, noindex: false, viewer: null });
    expect(ad.body.job.id).toBe(live.id);

    await owner.api("POST", `/v1/salon/jobs/${closing.id}/close`);
    const closed = await get<{ closed: boolean; noindex: boolean; similar: { id: string }[] }>(
      app,
      `/v1/jobs/by-path?path=${closing.path}`,
    );
    expect(closed.body).toMatchObject({ closed: true, noindex: true });
    expect(closed.body.similar.map((j) => j.id)).toContain(live.id);

    // Expired counts as closed.
    await query(
      sql`update jobs set expires_at = now() - interval '1 minute' where slug = ${live.slug} and suburb_slug = ${suburbSlug}`,
    );
    expect(
      (await get<{ closed: boolean }>(app, `/v1/jobs/by-path?path=${live.path}`)).body.closed,
    ).toBe(true);

    for (const missing of [
      `/jobs/${state}/${suburbSlug}/no-such-job`,
      "/jobs/wizard",
      "/jobs/nsw/never-heard-of-it-xyz",
      "/jobs/NSW",
      "/salons/nsw",
      "/jobs/barber/surry-hills",
    ]) {
      expect((await get(app, `/v1/jobs/by-path?path=${missing}`)).status, missing).toBe(404);
    }
    // A draft has no public page.
    const draft = await postJob(owner, { suburb }, false);
    expect((await get(app, `/v1/jobs/by-path?path=${draft.path}`)).status).toBe(404);
  });

  it("answers the directory and salon pages, with contact details only for signed-in visitors", async () => {
    const app = createTestApp();
    const suburb = testSuburb();
    const { owner, salon } = await salonOwner(app, { suburb });
    await postJob(owner, { suburb });
    const page = await get<{
      kind: string;
      claimable: boolean;
      jobs: unknown[];
      salon: { contact: unknown; liveJobs: number };
    }>(app, `/v1/salons/by-path?path=${salon.path}`);
    expect(page.body).toMatchObject({ kind: "salon", claimable: false });
    expect(page.body.salon.contact).toBeNull();
    expect(page.body.jobs).toHaveLength(1);
    const visitor = await app.person("Visitor");
    const signedIn = await visitor.api<{ salon: { contact: { phone: string } } }>(
      "GET",
      `/v1/salons/by-path?path=${salon.path}`,
    );
    expect(signedIn.body.salon.contact.phone).toBe("0290001234");

    const [, , state, suburbSlug] = salon.path.split("/");
    const listing = await get<{
      kind: string;
      heading: string;
      salons: { items: { id: string; liveJobs: number }[] };
    }>(app, `/v1/salons/by-path?path=/salons/${state}/${suburbSlug}`);
    expect(listing.body.kind).toBe("landing");
    expect(listing.body.heading).toBe(`Hair and beauty salons in ${suburb} NSW`);
    expect(listing.body.salons.items).toEqual([
      expect.objectContaining({ id: salon.id, liveJobs: 1 }),
    ]);
    const search = await get<{ items: { id: string }[] }>(
      app,
      `/v1/salons?q=${encodeURIComponent(salon.name)}&hiring=true`,
    );
    expect(search.body.items.map((s) => s.id)).toEqual([salon.id]);
  });
});

describe("the sitemap", () => {
  it("lists live jobs, visible salons and the listing pages that have them", async () => {
    const app = createTestApp();
    const suburb = testSuburb();
    const { owner, salon } = await salonOwner(app, { suburb });
    const live = await postJob(owner, { suburb, role: "nail_technician" });
    const closed = await postJob(owner, { suburb });
    await owner.api("POST", `/v1/salon/jobs/${closed.id}/close`);
    const hidden = await salonOwner(app, { suburb: testSuburb() });
    const hiddenJob = await postJob(hidden.owner, { suburb: testSuburb() });
    await query(sql`update salons set status = 'removed' where name = ${hidden.salon.name}`);

    const sitemap = await get<{ entries: { path: string; kind: string; lastmod: string }[] }>(
      app,
      "/v1/site/sitemap",
    );
    const paths = new Map(sitemap.body.entries.map((e) => [e.path, e.kind]));
    const [, , state, suburbSlug] = live.path.split("/");
    expect(paths.get(live.path)).toBe("job");
    expect(paths.get(salon.path)).toBe("salon");
    expect(paths.get(`/jobs/nail-technician/${state}/${suburbSlug}`)).toBe("jobs_landing");
    expect(paths.get(`/jobs/${state}/${suburbSlug}`)).toBe("jobs_landing");
    expect(paths.get(`/salons/${state}/${salon.path.split("/")[3]}`)).toBe("salons_landing");
    expect(paths.has(closed.path)).toBe(false);
    expect(paths.has(hiddenJob.path)).toBe(false);
    expect(paths.has(hidden.salon.path)).toBe(false);
  });
});
