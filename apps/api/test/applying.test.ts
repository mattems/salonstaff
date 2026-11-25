import { LIMITS } from "@salonstaff/shared";
import { describe, expect, it } from "vitest";
import { postJob, readySeeker, salonOwner, seekerWithProfile, verifyIdentity } from "./fixtures";
import { createTestApp } from "./helpers";

interface JobAd {
  kind: "job";
  closed: boolean;
  viewer: {
    applied: boolean;
    saved: boolean;
    canApply: boolean;
    blocker: string | null;
    reason: string | null;
  } | null;
}

describe("applying for a job", () => {
  it("is blocked until the person has a profile and a verified ID", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner);

    expect((await app.call(`/v1/jobs/${job.id}/apply`, { method: "POST" })).status).toBe(401);

    const person = await app.person("Applicant");
    const noProfile = await person.api<{ code: string }>("POST", `/v1/jobs/${job.id}/apply`, {});
    expect(noProfile.status).toBe(403);
    expect(noProfile.body.code).toBe("cannot_apply");

    const seeker = await seekerWithProfile(app, "Unverified");
    const ad = await seeker.api<JobAd>("GET", `/v1/jobs/by-path?path=${job.path}`);
    expect(ad.body.viewer).toMatchObject({ canApply: false, blocker: "verify" });
    const unverified = await seeker.api<{ code: string; hint: string }>(
      "POST",
      `/v1/jobs/${job.id}/apply`,
      {},
    );
    expect(unverified.status).toBe(403);
    expect(unverified.body.code).toBe("not_verified");
    expect(unverified.body.hint).toContain("/v1/me/checks/identity");

    // A failed check doesn't count.
    await verifyIdentity(seeker, "failed");
    expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(403);

    await verifyIdentity(seeker);
    const checks = await seeker.api<{
      verification: {
        identity: string;
        level: number;
        nameMatched: boolean;
        references: { identity?: string };
      };
    }>("GET", "/v1/me/checks");
    expect(checks.body.verification).toMatchObject({
      identity: "verified",
      level: 1,
      nameMatched: true,
    });
    expect(checks.body.verification.references.identity).toMatch(
      /^SSV-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/,
    );
    expect(
      (await seeker.api<JobAd>("GET", `/v1/jobs/by-path?path=${job.path}`)).body.viewer,
    ).toMatchObject({ canApply: true, blocker: null });

    // A dry run checks everything and sends nothing.
    const dry = await seeker.api("POST", `/v1/jobs/${job.id}/apply?dry_run=true`, {});
    expect(dry.status).toBe(201);
    expect(app.sent).toHaveLength(0);

    const applied = await seeker.api<{ id: string; status: string }>(
      "POST",
      `/v1/jobs/${job.id}/apply`,
      { coverNote: "Keen!" },
    );
    expect(applied.status).toBe(201);
    expect(applied.body.id).toMatch(/^app_/);
    expect(applied.body.status).toBe("submitted");
    // The salon owner is told.
    expect(app.sent.find((m) => m.to === owner.email)?.subject).toContain("New verified applicant");

    const again = await seeker.api<{ code: string }>("POST", `/v1/jobs/${job.id}/apply`, {});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("conflict");
    expect(
      (await seeker.api<JobAd>("GET", `/v1/jobs/by-path?path=${job.path}`)).body.viewer,
    ).toMatchObject({ applied: true, blocker: "applied" });

    const mine = await seeker.api<{
      items: { id: string; status: string; coverNote: string; job: { id: string } }[];
    }>("GET", "/v1/me/applications");
    expect(mine.body.items).toEqual([
      expect.objectContaining({
        id: applied.body.id,
        coverNote: "Keen!",
        job: expect.objectContaining({ id: job.id }),
      }),
    ]);
  });

  it("refuses employer accounts and jobs that need a verified qualification", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner, { requireQualification: true });
    expect(
      (await owner.api<{ code: string }>("POST", `/v1/jobs/${job.id}/apply`, {})).body.code,
    ).toBe("forbidden");
    const seeker = await readySeeker(app);
    const refused = await seeker.api<{ code: string; detail: string }>(
      "POST",
      `/v1/jobs/${job.id}/apply`,
      {},
    );
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("qualification");
  });

  it("refuses closed jobs", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner);
    expect((await owner.api("POST", `/v1/salon/jobs/${job.id}/close`)).status).toBe(200);
    const seeker = await readySeeker(app);
    expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(404);
    expect(
      (await seeker.api<JobAd>("GET", `/v1/jobs/by-path?path=${job.path}`)).body.viewer,
    ).toMatchObject({ canApply: false, blocker: "closed" });
  });

  it(`stops at ${LIMITS.applicationsPerDay} applications a day`, async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const seeker = await readySeeker(app, "Busy");
    const jobs = [];
    for (let i = 0; i <= LIMITS.applicationsPerDay; i++) jobs.push(await postJob(owner));
    for (const job of jobs.slice(0, LIMITS.applicationsPerDay)) {
      expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);
    }
    const last = jobs.at(-1) as { id: string };
    const limited = await seeker.api<{ code: string }>("POST", `/v1/jobs/${last.id}/apply`, {});
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("rate_limited");
  });
});

describe("saving jobs", () => {
  it("saves and unsaves, and keeps closed jobs marked closed", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const job = await postJob(owner);
    const seeker = await app.person("Saver");
    expect(
      (await seeker.api<{ saved: boolean }>("POST", `/v1/jobs/${job.id}/save`)).body.saved,
    ).toBe(true);
    expect((await seeker.api("POST", `/v1/jobs/${job.id}/save`)).status).toBe(200);
    const saved = await seeker.api<{ items: { id: string; closed: boolean }[] }>(
      "GET",
      "/v1/me/saved",
    );
    expect(saved.body.items).toEqual([expect.objectContaining({ id: job.id, closed: false })]);
    expect(
      (await seeker.api<JobAd>("GET", `/v1/jobs/by-path?path=${job.path}`)).body.viewer?.saved,
    ).toBe(true);

    await owner.api("POST", `/v1/salon/jobs/${job.id}/close`);
    const after = await seeker.api<{ items: { closed: boolean }[] }>("GET", "/v1/me/saved");
    expect(after.body.items[0]?.closed).toBe(true);

    expect(
      (await seeker.api<{ saved: boolean }>("DELETE", `/v1/jobs/${job.id}/save`)).body.saved,
    ).toBe(false);
    expect((await seeker.api<{ items: unknown[] }>("GET", "/v1/me/saved")).body.items).toEqual([]);
  });
});
