import { env } from "cloudflare:test";
import { schema } from "@salonstaff/db";
import { encodeId } from "@salonstaff/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestApp, withDb } from "./helpers";
import { admin, auditFor, seedCheck, seedClaim, seedSalon, staffMember, userIdOf } from "./staff";

type Body = Record<string, unknown>;
type Check = {
  id: string;
  status: string;
  details: Body;
  document_url: string | null;
  reference: string | null;
  person: { email: string };
};
type Claim = {
  id: string;
  status: string;
  abn_matches: boolean | null;
  salon: { id: string };
  claimant: { email: string };
};
type Page<T> = { data: T[]; next_cursor: string | null };
const { person } = createTestApp();

async function seeker(name = "Sid") {
  const who = await person(name);
  return { ...who, uuid: await userIdOf(who.email) };
}

const checkRow = (id: string) =>
  withDb(
    async (db) =>
      (await db.select().from(schema.seekerChecks).where(eq(schema.seekerChecks.id, id)))[0],
  );

describe("the checks queue", () => {
  it("lists what's waiting, with who sent it and what they sent", async () => {
    const support = await staffMember("support");
    const sid = await seeker();
    const check = await seedCheck(sid.uuid);
    const queue = await admin<Page<Check>>(support, "GET", "/checks?limit=100");
    const mine = queue.body.data.find((row) => row.id === encodeId("check", check.id));
    expect(mine).toMatchObject({
      status: "pending",
      person: { email: sid.email },
      details: { basis: "visa", visaGrantNumber: "0123456789012" },
      document_url: null,
    });
  });

  it("shows the certificate to staff, then deletes it with the decision", async () => {
    const support = await staffMember("support");
    const sid = await seeker();
    const key = `test-${crypto.randomUUID()}.pdf`;
    await env.PRIVATE.put(key, "%PDF-1.4 certificate", {
      httpMetadata: { contentType: "application/pdf" },
    });
    const check = await seedCheck(sid.uuid, {
      kind: "qualification",
      documentKey: key,
      result: { title: "Cert III in Hairdressing" },
    });
    const checkId = encodeId("check", check.id);

    const document = await admin(support, "GET", `/checks/${checkId}/document`);
    expect(document.status).toBe(200);
    expect(document.headers.get("Content-Type")).toBe("application/pdf");
    expect(document.headers.get("Cache-Control")).toBe("private, no-store");
    expect(
      (await admin(await staffMember("readonly"), "GET", `/checks/${checkId}/document`)).status,
    ).toBe(403);

    const decided = await admin<Check>(support, "POST", `/checks/${checkId}/decision`, {
      decision: "verified",
      note: "Checked with the RTO",
    });
    expect(decided.status).toBe(200);
    expect(decided.body).toMatchObject({ status: "verified", document_url: null });
    expect(decided.body.reference).toMatch(/^SSV-/);
    expect(await env.PRIVATE.get(key)).toBeNull();
    expect((await admin(support, "GET", `/checks/${checkId}/document`)).status).toBe(404);
    expect((await checkRow(check.id))?.documentKey).toBeNull();
    expect(await auditFor(check.id, "check.verified")).toHaveLength(1);

    const twice = await admin(support, "POST", `/checks/${checkId}/decision`, {
      decision: "failed",
      note: "Oops",
    });
    expect(twice.status).toBe(409);
  });

  it("needs a note to fail a check, and forgets the visa details either way", async () => {
    const support = await staffMember("support");
    const sid = await seeker();
    const check = await seedCheck(sid.uuid);
    const checkId = encodeId("check", check.id);
    expect(
      (await admin(support, "POST", `/checks/${checkId}/decision`, { decision: "failed" })).status,
    ).toBe(400);
    const failed = await admin<Check>(support, "POST", `/checks/${checkId}/decision`, {
      decision: "failed",
      note: "No VEVO record",
    });
    expect(failed.body.status).toBe("failed");
    expect(JSON.stringify(await checkRow(check.id))).not.toContain("0123456789012");
  });
});

describe("claims", () => {
  it("lists open claims with the ABN given against the listing's", async () => {
    const support = await staffMember("support");
    const claimant = await seeker("Casey");
    const salon = await seedSalon({ source: "directory", abn: null });
    const claim = await seedClaim(salon.id, claimant.uuid);
    const open = await admin<Page<Claim>>(support, "GET", "/claims?limit=100");
    const mine = open.body.data.find((row) => row.id === encodeId("claim", claim.id));
    expect(mine).toMatchObject({
      status: "pending_review",
      abn_matches: null,
      claimant: { email: claimant.email },
    });
  });

  it("approves a claim: the claimant owns the listing", async () => {
    const support = await staffMember("support");
    const claimant = await seeker("Casey");
    const salon = await seedSalon({ source: "directory" });
    const claim = await seedClaim(salon.id, claimant.uuid);
    const approved = await admin<Claim>(
      support,
      "POST",
      `/claims/${encodeId("claim", claim.id)}/approve`,
      { note: "Called the salon" },
    );
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("approved");
    const [row] = await withDb((db) =>
      db.select().from(schema.salons).where(eq(schema.salons.id, salon.id)),
    );
    expect(row?.ownerId).toBe(claimant.uuid);
    expect(await auditFor(claim.id, "claim.approved")).toHaveLength(1);
    expect(
      (await admin(support, "POST", `/claims/${encodeId("claim", claim.id)}/approve`, {})).status,
    ).toBe(409);
    expect(admin.sent.some((m) => m.to === claimant.email)).toBe(true);
  });

  it("rejects a claim only with a note", async () => {
    const support = await staffMember("support");
    const claimant = await seeker("Casey");
    const salon = await seedSalon({ source: "directory" });
    const claim = await seedClaim(salon.id, claimant.uuid);
    const path = `/claims/${encodeId("claim", claim.id)}/reject`;
    expect((await admin(support, "POST", path, {})).status).toBe(400);
    const rejected = await admin<Claim>(support, "POST", path, {
      note: "Couldn't confirm with the salon",
    });
    expect(rejected.body.status).toBe("rejected");
    const [row] = await withDb((db) =>
      db.select().from(schema.salons).where(eq(schema.salons.id, salon.id)),
    );
    expect(row?.ownerId).toBeNull();
    expect((await auditFor(claim.id, "claim.rejected"))[0]?.reason).toBe(
      "Couldn't confirm with the salon",
    );
  });

  it("is refused to read-only staff", async () => {
    const readonly = await staffMember("readonly");
    expect((await admin(readonly, "GET", "/claims")).status).toBe(403);
    expect((await admin(readonly, "GET", "/checks")).status).toBe(403);
  });
});
