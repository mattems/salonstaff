import { env } from "cloudflare:test";
import { checks, housekeeping } from "@salonstaff/db";
import { decodeId, uuidv7 } from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { form, PDF, PNG, seekerWithProfile } from "./fixtures";
import { createTestApp, query, withDb } from "./helpers";

interface Checks {
  verification: {
    rightToWork: string;
    qualification: string;
    level: number;
    references: Record<string, string>;
    qualificationTitle: string | null;
  };
  checks: { id: string; kind: string; status: string; reference: string | null }[];
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
    // Not ID-verified, so still level 0.
    expect(after.body.verification.level).toBe(0);
  });

  it("deletes a certificate from the private bucket once decided", async () => {
    const app = createTestApp();
    const seeker = await seekerWithProfile(app, "Certified");
    const image = await seeker.api(
      "POST",
      "/v1/me/checks/qualification",
      form({ file: { bytes: PNG, name: "c.png", type: "image/png" }, title: "Diploma of Beauty" }),
    );
    expect(image.status).toBe(201);
    const sent = await seeker.api<Checks>("GET", "/v1/me/checks");
    const checkId = decodeId("check", sent.body.checks[0]?.id as string) as string;
    const before = await checkRow(checkId);
    const key = before?.document_key as string;
    expect(await env.PRIVATE.head(key)).not.toBeNull();
    expect(
      (
        await seeker.api(
          "POST",
          "/v1/me/checks/qualification",
          form({ file: { bytes: PDF, name: "c.pdf", type: "application/pdf" }, title: "Another" }),
        )
      ).status,
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
      result: { title: "Diploma of Beauty" },
    });

    // A PDF certificate is accepted too, and a pass shows its title.
    expect(
      (
        await seeker.api(
          "POST",
          "/v1/me/checks/qualification",
          form({ file: { bytes: PDF, name: "c.pdf", type: "application/pdf" }, title: "Cert III" }),
        )
      ).status,
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
      form({ file: { bytes: PDF, name: "c.pdf", type: "application/pdf" }, title: "Old cert" }),
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
});
