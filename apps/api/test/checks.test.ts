import { env } from "cloudflare:test";
import { checks, housekeeping } from "@salonstaff/db";
import { decodeId, uuidv7 } from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  form,
  PDF,
  type Person,
  PNG,
  profileInput,
  readySeeker,
  seekerWithProfile,
  uid,
  verifyIdentity,
} from "./fixtures";
import { createTestApp, query, withDb } from "./helpers";

interface Checks {
  verification: {
    rightToWork: string;
    qualification: string;
    level: number;
    references: Record<string, string>;
    qualificationTitle: string | null;
    rightToWorkBasis: string | null;
    rightToWorkCheckedVia: string | null;
  };
  checks: {
    id: string;
    kind: string;
    status: string;
    reference: string | null;
    educationId: string | null;
  }[];
}

const checkRow = (id: string) =>
  query<{
    status: string;
    result: Record<string, unknown>;
    document_key: string | null;
    reference: string | null;
    reviewed_by: string | null;
  }>(
    sql`select status, result, document_key, reference, reviewed_by from seeker_checks where id = ${id}`,
  ).then((rows) => rows[0]);

/** Adds an education entry and returns its ID. */
async function education(seeker: Person, qualification: string) {
  const added = await seeker.api<{ education: { id: string; qualification: string }[] }>(
    "POST",
    "/v1/me/education",
    { qualification, institution: "TAFE NSW", year: 2019 },
  );
  expect(added.status).toBe(201);
  return added.body.education.find((e) => e.qualification === qualification)?.id as string;
}

const certificate = (educationId: string, type: "png" | "pdf" = "pdf") =>
  form({
    file:
      type === "png"
        ? { bytes: PNG, name: "c.png", type: "image/png" }
        : { bytes: PDF, name: "c.pdf", type: "application/pdf" },
    educationId,
  });

describe("verification checks", () => {
  it("won't start an identity check before there's a profile, or send people elsewhere", async () => {
    const app = createTestApp();
    const person = await app.person("Early");
    expect((await person.api("POST", "/v1/me/checks/identity", {})).status).toBe(409);
    const seeker = await seekerWithProfile(app, "Redirected");
    const elsewhere = await seeker.api<{ errors: { path: string }[] }>(
      "POST",
      "/v1/me/checks/identity",
      { returnUrl: "https://evil.example/steal" },
    );
    expect(elsewhere.status).toBe(400);
    expect(elsewhere.body.errors[0]?.path).toBe("returnUrl");
    const app2 = await seeker.api<{ url: string }>("POST", "/v1/me/checks/identity", {
      returnUrl: "salonstaff://verify-complete",
    });
    expect(new URL(app2.body.url).searchParams.get("return")).toBe("salonstaff://verify-complete");
  });

  it("keeps visa details only until staff decide", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Visa");
    const noGrant = await seeker.api<{ errors: { path: string }[] }>(
      "POST",
      "/v1/me/checks/right-to-work",
      { basis: "visa" },
    );
    expect(noGrant.status).toBe(400);
    expect(noGrant.body.errors[0]?.path).toBe("visaGrantNumber");

    const sent = await seeker.api<Checks>("POST", "/v1/me/checks/right-to-work", {
      basis: "visa",
      visaGrantNumber: "1234567890123",
      passportCountry: "New Zealand",
    });
    expect(sent.status).toBe(201);
    expect(sent.body.verification.rightToWork).toBe("pending");
    // How work rights were checked shows only once they're verified.
    expect(sent.body.verification.rightToWorkBasis).toBeNull();
    expect(
      (await seeker.api("POST", "/v1/me/checks/right-to-work", { basis: "citizen" })).status,
    ).toBe(409);
    const checkId = decodeId("check", sent.body.checks[0]?.id as string) as string;
    expect((await checkRow(checkId))?.result).toMatchObject({ visaGrantNumber: "1234567890123" });

    const staffId = uuidv7();
    const { check, evidenceKeys } = await withDb((db) =>
      checks(db).review(checkId, "verified", staffId, "VEVO ok"),
    );
    expect(evidenceKeys).toEqual([]);
    expect(check.reference).toMatch(/^SSV-/);
    const row = await checkRow(checkId);
    // The grant number and passport country are gone; the basis and how it was checked stay.
    expect(row?.result).toEqual({ basis: "visa", checkedVia: "VEVO" });
    expect(row).toMatchObject({ status: "verified", reviewed_by: staffId });
    await expect(withDb((db) => checks(db).review(checkId, "failed", staffId))).rejects.toThrow(
      /already been decided/,
    );

    const after = await seeker.api<Checks>("GET", "/v1/me/checks");
    expect(after.body.verification.references.rightToWork).toBe(check.reference as string);
    expect(after.body.verification).toMatchObject({
      rightToWorkBasis: "visa",
      rightToWorkCheckedVia: "VEVO",
    });

    // The share page says how, but not the verification ID.
    const { shareCode } = (
      await seeker.api<{ shareCode: string }>("PATCH", "/v1/me/profile/settings", {
        visibility: "public",
      })
    ).body;
    const shared = (await (await app.call(`/v1/profiles/${shareCode}`)).json()) as {
      verification: Record<string, unknown>;
    };
    expect(shared.verification).toEqual({
      identity: "not_started",
      rightToWork: "verified",
      qualification: "not_started",
      level: 0,
      rightToWorkBasis: "visa",
      rightToWorkCheckedVia: "VEVO",
    });
    // Not ID-verified, so still level 0.
    expect(after.body.verification.level).toBe(0);
  });

  it("deletes a certificate from the private bucket once decided", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Certified");
    const diploma = await education(seeker, "Diploma of Beauty");
    const image = await seeker.api(
      "POST",
      "/v1/me/checks/qualification",
      certificate(diploma, "png"),
    );
    expect(image.status).toBe(201);
    const sent = await seeker.api<Checks>("GET", "/v1/me/checks");
    const checkId = decodeId("check", sent.body.checks[0]?.id as string) as string;
    const before = await checkRow(checkId);
    const key = before?.document_key as string;
    expect(await env.PRIVATE.head(key)).not.toBeNull();
    // One at a time for the same entry.
    expect(
      (await seeker.api("POST", "/v1/me/checks/qualification", certificate(diploma))).status,
    ).toBe(409);

    const { evidenceKeys } = await withDb((db) =>
      checks(db).review(checkId, "failed", uuidv7(), "Blurry"),
    );
    // The scope returns what to delete; the admin route deletes it. Here we do.
    expect(evidenceKeys).toEqual([key]);
    for (const k of evidenceKeys) await env.PRIVATE.delete(k);
    expect(await env.PRIVATE.head(key)).toBeNull();
    const row = await checkRow(checkId);
    expect(row).toMatchObject({
      status: "failed",
      document_key: null,
      reference: null,
      result: { title: "Diploma of Beauty", institution: "TAFE NSW", year: 2019 },
    });

    // A PDF certificate is accepted too, and a pass shows its title.
    const cert = await education(seeker, "Cert III");
    expect(
      (await seeker.api("POST", "/v1/me/checks/qualification", certificate(cert))).status,
    ).toBe(201);
    const second = (await seeker.api<Checks>("GET", "/v1/me/checks")).body.checks[0]?.id as string;
    await withDb((db) =>
      checks(db).review(decodeId("check", second) as string, "verified", uuidv7()),
    );
    const now = await seeker.api<Checks>("GET", "/v1/me/checks");
    expect(now.body.verification).toMatchObject({
      qualification: "verified",
      qualificationTitle: "Cert III",
    });
  });

  it("expires evidence nobody reviewed in 30 days", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Forgotten");
    await seeker.api(
      "POST",
      "/v1/me/checks/qualification",
      certificate(await education(seeker, "Old cert")),
    );
    const id = decodeId(
      "check",
      (await seeker.api<Checks>("GET", "/v1/me/checks")).body.checks[0]?.id as string,
    ) as string;
    const key = (await checkRow(id))?.document_key as string;
    await query(
      sql`update seeker_checks set created_at = now() - interval '31 days' where id = ${id}`,
    );

    const { evidenceKeys } = await withDb((db) => housekeeping(db).purgeStaleEvidence());
    expect(evidenceKeys).toContain(key);
    expect(await checkRow(id)).toMatchObject({ status: "failed", document_key: null, result: {} });
  });

  it("verifies each education entry on its own, and shows it on the entry", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Educated");
    const cert = await education(seeker, "Cert III in Hairdressing");
    const diploma = await education(seeker, "Diploma of Salon Management");
    const other = await seekerWithProfile(app, "Stranger");
    expect((await other.api("POST", "/v1/me/checks/qualification", certificate(cert))).status).toBe(
      404,
    );

    // Two entries can wait for review at once.
    for (const id of [cert, diploma]) {
      expect(
        (await seeker.api("POST", "/v1/me/checks/qualification", certificate(id))).status,
      ).toBe(201);
    }
    type Profile = {
      education: {
        id: string;
        verification: { status: string; reference: string | null } | null;
      }[];
    };
    const statusOf = async (id: string) =>
      (await seeker.api<Profile>("GET", "/v1/me/profile")).body.education.find((e) => e.id === id)
        ?.verification;
    expect(await statusOf(cert)).toEqual({ status: "pending", reference: null });

    const sent = (await seeker.api<Checks>("GET", "/v1/me/checks")).body.checks;
    const certCheck = sent.find((c) => c.educationId === cert)?.id as string;
    await withDb((db) =>
      checks(db).review(decodeId("check", certCheck) as string, "verified", uuidv7()),
    );
    const passed = await statusOf(cert);
    expect(passed?.status).toBe("verified");
    expect(passed?.reference).toMatch(/^SSV-/);
    expect(await statusOf(diploma)).toEqual({ status: "pending", reference: null });
    // A verified entry needs nothing more.
    expect(
      (await seeker.api("POST", "/v1/me/checks/qualification", certificate(cert))).status,
    ).toBe(409);

    // The share page says it passed, without the verification ID.
    const { shareCode } = (
      await seeker.api<{ shareCode: string }>("PATCH", "/v1/me/profile/settings", {
        visibility: "public",
      })
    ).body;
    const shared = (await (await app.call(`/v1/profiles/${shareCode}`)).json()) as Profile;
    expect(shared.education.find((e) => e.id === cert)?.verification).toEqual({
      status: "verified",
      reference: null,
    });

    // Removing the entry keeps the check (its verification ID stays valid), unlinked.
    await seeker.api("DELETE", `/v1/me/education/${cert}`);
    const after = (await seeker.api<Checks>("GET", "/v1/me/checks")).body;
    expect(after.checks.find((c) => c.id === certCheck)?.educationId).toBeNull();
    expect(after.verification.qualification).toBe("verified");
  });
});

describe("a new name after the ID check (D-16)", () => {
  it("expires the ID check; the same name written differently doesn't", async () => {
    const app = createTestApp();
    const seeker = await readySeeker(app, "Renamed");
    const verification = async () =>
      (
        await seeker.api<{ verification: { identity: string; level: number } }>(
          "GET",
          "/v1/me/checks",
        )
      ).body.verification;
    expect((await verification()).identity).toBe("verified");
    const { profile } = (
      await seeker.api<{ profile: { firstName: string; lastName: string } }>(
        "GET",
        "/v1/me/profile",
      )
    ).body;

    const sameName = profileInput({
      firstName: profile.firstName.toLowerCase(),
      lastName: profile.lastName.toUpperCase(),
    });
    expect((await seeker.api("PUT", "/v1/me/profile", sameName)).status).toBe(200);
    expect((await verification()).identity).toBe("verified");

    const renamed = profileInput({ firstName: profile.firstName, lastName: `Other${uid()}` });
    expect((await seeker.api("PUT", "/v1/me/profile", renamed)).status).toBe(200);
    expect(await verification()).toMatchObject({ identity: "expired", level: 0 });
    const userId = (
      await query<{ id: string }>(sql`select id from users where email = ${seeker.email}`)
    )[0]?.id;
    const audited = await query<{ reason: string }>(
      sql`select a.reason from audit_log a join seeker_checks c on c.id::text = a.target_id
          where c.user_id = ${userId} and a.action = 'check.expired'`,
    );
    expect(audited).toEqual([{ reason: "name_changed" }]);

    // They can verify again, and pass with the new name.
    await verifyIdentity(seeker);
    expect((await verification()).identity).toBe("verified");
  });
});
