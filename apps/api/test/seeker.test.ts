import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  form,
  PDF,
  PNG,
  profileInput,
  salonOwner,
  seekerWithProfile,
  verifyIdentity,
} from "./fixtures";
import { createTestApp, query } from "./helpers";

interface FullProfile {
  profile: {
    firstName: string;
    phone: string | null;
    instagram: string | null;
    photoUrl: string | null;
    specialties: string[];
    travelKm: number | null;
  };
  experience: { id: string; title: string; endMonth: string | null }[];
  education: { id: string; qualification: string }[];
  portfolio: { id: string; imageUrl: string; caption: string | null }[];
  verification: { identity: string; level: number; references: Record<string, string> };
}

describe("a job seeker's profile", () => {
  it("needs a sign-in, and a seeker account", async () => {
    const app = createTestApp();
    expect((await app.call("/v1/me")).status).toBe(401);
    const owner = await app.person("Employer", { role: "employer" });
    expect((await owner.api("PUT", "/v1/me/profile", profileInput())).status).toBe(403);
  });

  it("saves the basics, then the sections", async () => {
    const app = createTestApp();
    const me = await app.person("Profile");
    expect((await me.api("GET", "/v1/me/profile")).status).toBe(404);
    // Sections need the basics first.
    expect(
      (
        await me.api("POST", "/v1/me/experience", {
          salonName: "A",
          title: "B",
          startMonth: "2020-01",
        })
      ).status,
    ).toBe(409);

    const bad = await me.api<{ errors: { path: string }[] }>(
      "PUT",
      "/v1/me/profile",
      profileInput({ phone: "12", roles: [] }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e) => e.path).sort()).toEqual(["phone", "roles"]);

    const saved = await me.api<FullProfile>(
      "PUT",
      "/v1/me/profile",
      profileInput({ instagram: "@sam.cuts" }),
    );
    expect(saved.status).toBe(200);
    expect(saved.body.profile.phone).toBe("+61412345678");
    expect(saved.body.profile.instagram).toBe("sam.cuts");
    expect(saved.body.verification.identity).toBe("not_started");

    const details = await me.api<FullProfile>("PUT", "/v1/me/profile/details", {
      specialties: ["Balayage", "balayage", "Foils"],
      brands: ["Olaplex"],
      availableDays: ["mon", "tue"],
      employmentTypes: ["full_time"],
      travelKm: "",
    });
    expect(details.status).toBe(200);
    expect(details.body.profile.specialties).toEqual(["balayage", "Foils"]);
    expect(details.body.profile.travelKm).toBeNull();

    const past = await me.api<FullProfile>("POST", "/v1/me/experience", {
      salonName: "Old Salon",
      title: "Stylist",
      startMonth: "2018-02",
      endMonth: "2020-06",
    });
    expect(past.status).toBe(201);
    const current = await me.api<FullProfile>("POST", "/v1/me/experience", {
      salonName: "New Salon",
      title: "Senior Colourist",
      startMonth: "2020-07",
    });
    // Current role first.
    expect(current.body.experience.map((e) => e.title)).toEqual(["Senior Colourist", "Stylist"]);
    const backwards = await me.api("POST", "/v1/me/experience", {
      salonName: "X",
      title: "Y",
      startMonth: "2020-07",
      endMonth: "2019-01",
    });
    expect(backwards.status).toBe(400);

    const education = await me.api<FullProfile>("POST", "/v1/me/education", {
      qualification: "Cert III in Hairdressing",
      institution: "TAFE NSW",
      year: 2017,
    });
    expect(education.status).toBe(201);
    const eduId = education.body.education[0]?.id as string;
    expect(eduId).toMatch(/^edu_/);

    const removed = await me.api<FullProfile>("DELETE", `/v1/me/education/${eduId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.education).toEqual([]);
    expect((await me.api("DELETE", `/v1/me/education/${eduId}`)).status).toBe(404);
    expect((await me.api("DELETE", "/v1/me/education/not-an-id")).status).toBe(404);

    const expId = current.body.experience[0]?.id as string;
    expect((await me.api("DELETE", `/v1/me/experience/${expId}`)).status).toBe(200);

    // Someone else can't remove your sections.
    const other = await seekerWithProfile(app, "Other");
    const pastId = past.body.experience[0]?.id as string;
    expect((await other.api("DELETE", `/v1/me/experience/${pastId}`)).status).toBe(404);

    const whoami = await me.api<{ name: string; role: string; profile: unknown; salon: unknown }>(
      "GET",
      "/v1/me",
    );
    expect(whoami.body.name).toMatch(/^Sam Tester/);
    expect(whoami.body.role).toBe("seeker");
    expect(whoami.body.profile).not.toBeNull();
    expect(whoami.body.salon).toBeNull();
  });

  it("uploads a photo and portfolio pictures to the media bucket", async () => {
    const app = createTestApp();
    const me = await seekerWithProfile(app, "Photo");

    const notAnImage = await me.api(
      "POST",
      "/v1/me/photo",
      form({ file: { bytes: PDF, name: "cv.pdf", type: "application/pdf" } }),
    );
    expect(notAnImage.status).toBe(415);
    expect((await me.api("POST", "/v1/me/photo", form({}))).status).toBe(400);

    const photo = await me.api<{ photoUrl: string }>(
      "POST",
      "/v1/me/photo",
      form({ file: { bytes: PNG, name: "me.png", type: "image/png" } }),
    );
    expect(photo.status).toBe(200);
    expect(photo.body.photoUrl).toMatch(/^http:\/\/localhost:8890\/media\/[0-9A-Za-z]+\.png$/);
    const key = photo.body.photoUrl.split("/").pop() as string;
    const served = await app.call(`/media/${key}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");

    // A new photo replaces (and deletes) the old one.
    const second = await me.api<{ photoUrl: string }>(
      "POST",
      "/v1/me/photo",
      form({ file: { bytes: PNG, name: "me2.png", type: "image/png" } }),
    );
    expect(second.body.photoUrl).not.toBe(photo.body.photoUrl);
    expect((await app.call(`/media/${key}`)).status).toBe(404);

    const item = await me.api<{ id: string; imageUrl: string; caption: string }>(
      "POST",
      "/v1/me/portfolio",
      form({ file: { bytes: PNG, name: "work.png", type: "image/png" }, caption: "Balayage" }),
    );
    expect(item.status).toBe(201);
    expect(item.body.id).toMatch(/^pfi_/);
    expect(item.body.caption).toBe("Balayage");

    // A dry run checks the file but stores nothing.
    const dry = await me.api(
      "POST",
      "/v1/me/portfolio?dry_run=true",
      form({ file: { bytes: PNG, name: "w.png", type: "image/png" } }),
    );
    expect(dry.status).toBe(201);
    const full = await me.api<FullProfile>("GET", "/v1/me/profile");
    expect(full.body.portfolio).toHaveLength(1);

    const removed = await me.api<FullProfile>("DELETE", `/v1/me/portfolio/${item.body.id}`);
    expect(removed.body.portfolio).toEqual([]);
    expect((await app.call(`/media/${item.body.imageUrl.split("/").pop()}`)).status).toBe(404);

    const gone = await me.api<{ photoUrl: null }>("DELETE", "/v1/me/photo");
    expect(gone.body.photoUrl).toBeNull();
  });

  it("audits changes", async () => {
    const app = createTestApp();
    const me = await seekerWithProfile(app, "Audited");
    const whoami = await me.api<{ id: string }>("GET", "/v1/me");
    const rows = await query<{ action: string }>(
      sql`select action from audit_log where actor_id = (select id from users where email = ${me.email})`,
    );
    expect(whoami.body.id).toMatch(/^usr_/);
    expect(rows.map((r) => r.action)).toContain("profile.created");
  });
});

describe("deleting an account", () => {
  it("removes the person, their files and the salon they created", async () => {
    const app = createTestApp();
    const me = await seekerWithProfile(app, "Leaving");
    await verifyIdentity(me);
    const photo = await me.api<{ photoUrl: string }>(
      "POST",
      "/v1/me/photo",
      form({ file: { bytes: PNG, name: "me.png", type: "image/png" } }),
    );
    const key = photo.body.photoUrl.split("/").pop() as string;

    const deleted = await me.api("DELETE", "/v1/me");
    expect(deleted.status).toBe(200);
    expect((await me.api("GET", "/v1/me")).status).toBe(401);
    expect((await app.call(`/media/${key}`)).status).toBe(404);
    const left = await query(sql`select 1 from users where email = ${me.email}`);
    expect(left).toHaveLength(0);

    const { owner, salon } = await salonOwner(app);
    expect((await owner.api("DELETE", "/v1/me")).status).toBe(200);
    const salons = await query(sql`select 1 from salons where name = ${salon.name}`);
    expect(salons).toHaveLength(0);
  });
});
