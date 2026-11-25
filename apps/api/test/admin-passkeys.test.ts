import { schema } from "@salonstaff/db";
import { decodeId } from "@salonstaff/shared";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withDb } from "./helpers";
import { softwarePasskey } from "./passkey";
import {
  ADMIN_ORIGIN,
  AUD,
  admin,
  type Challenge,
  confirm,
  register,
  SKIP,
  staffMember,
  type Who,
} from "./staff";

type Passkey = { id: string; name: string; last_used_at: string | null };

const list = async (who: Who) =>
  (await admin<{ data: Passkey[] }>(who, "GET", "/passkeys")).body.data;

const staffAudit = (who: Who, action: string) =>
  withDb((db) =>
    db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.targetId, who.id), eq(schema.auditLog.action, action))),
  );

describe("registering a passkey", () => {
  it("takes the first on trust, lists it and records it", async () => {
    const matt = await staffMember("owner", "Matt");
    const { passkey } = await register(matt);

    expect(passkey).toMatchObject({ name: "MacBook", last_used_at: null });
    expect(passkey.id).toMatch(/^pk_/);
    expect(await list(matt)).toEqual([passkey]);
    const [audit] = await staffAudit(matt, "staff.passkey_added");
    expect(audit).toMatchObject({ actorType: "staff", actorId: matt.id });
    expect(JSON.stringify(audit)).not.toContain("public");

    const staff = await admin<{ data: { id: string; passkeys: number }[] }>(matt, "GET", "/staff");
    expect(staff.body.data.find((row) => decodeId("staff", row.id) === matt.id)?.passkeys).toBe(1);
  });

  it("needs an existing passkey to add another", async () => {
    const matt = await staffMember("owner");
    const first = await register(matt);

    const bare = await admin(matt, "POST", "/passkeys/options", {});
    expect(bare.status).toBe(403);
    expect(bare.body).toMatchObject({ code: "confirmation_required" });

    await register(matt, "YubiKey", first.device);
    expect((await list(matt)).map((p) => p.name)).toEqual(["MacBook", "YubiKey"]);
    expect((await list(matt))[0]?.last_used_at).not.toBeNull();
  });

  it("refuses a passkey from another site, or one that didn't verify the person", async () => {
    const matt = await staffMember("owner");
    for (const flaws of [{ origin: "https://admin.evil.example" }, { unverified: true }]) {
      const device = await softwarePasskey(ADMIN_ORIGIN);
      const started = await admin<Challenge>(matt, "POST", "/passkeys/options", {});
      const made = await admin(matt, "POST", "/passkeys", {
        id: started.body.id,
        name: "Bad",
        response: await device.register(started.body.options, flaws),
      });
      expect(made.status).toBe(400);
    }
    expect(await list(matt)).toEqual([]);
  });

  it("uses a registration once, and only for the person who asked", async () => {
    const matt = await staffMember("owner");
    const dana = await staffMember("support");
    const device = await softwarePasskey(ADMIN_ORIGIN);
    const started = await admin<Challenge>(matt, "POST", "/passkeys/options", {});
    const finish = async (who: Who) =>
      admin(who, "POST", "/passkeys", {
        id: started.body.id,
        name: "MacBook",
        response: await device.register(started.body.options),
      });

    expect((await finish(dana)).status).toBe(409);
    expect((await finish(matt)).status).toBe(201);
    expect((await finish(matt)).status).toBe(409);
  });

  it("renames one", async () => {
    const matt = await staffMember("owner");
    const { passkey } = await register(matt);
    const renamed = await admin<Passkey>(matt, "PATCH", `/passkeys/${passkey.id}`, {
      name: "Work laptop",
    });
    expect(renamed.body.name).toBe("Work laptop");
    expect(await staffAudit(matt, "staff.passkey_renamed")).toHaveLength(1);
  });
});

describe("confirming with a passkey", () => {
  const remove = (who: Who, passkey: Passkey, confirmation?: unknown) =>
    admin(who, "DELETE", `/passkeys/${passkey.id}`, { confirmation });

  it("removes a passkey once confirmed, and says which passkey confirmed it", async () => {
    const matt = await staffMember("owner");
    const { device, passkey } = await register(matt);

    const done = await remove(
      matt,
      passkey,
      await confirm(matt, device, "passkey.remove", passkey.id),
    );
    expect(done).toMatchObject({ status: 200, body: { removed: true } });
    expect(await list(matt)).toEqual([]);
    const [audit] = await staffAudit(matt, "staff.passkey_removed");
    expect(audit?.confirmedWith).toBe(decodeId("passkey", passkey.id));
  });

  it("refuses without one, and a dry run needs none", async () => {
    const matt = await staffMember("owner");
    const { passkey } = await register(matt);

    const bare = await remove(matt, passkey);
    expect(bare.status).toBe(403);
    expect(bare.body).toMatchObject({ code: "confirmation_required" });
    expect((bare.body as { hint: string }).hint).toBeTruthy();

    const dry = await admin(matt, "DELETE", `/passkeys/${passkey.id}?dry_run=true`, {});
    expect(dry.status).toBe(200);
    expect(await list(matt)).toHaveLength(1);
  });

  it("refuses a confirmation made for another action or another target", async () => {
    const matt = await staffMember("owner");
    const first = await register(matt);
    const second = await register(matt, "YubiKey", first.device);

    for (const confirmation of [
      await confirm(matt, first.device, "passkey.add", "new"),
      await confirm(matt, first.device, "passkey.remove", first.passkey.id),
    ]) {
      expect((await remove(matt, second.passkey, confirmation)).status).toBe(403);
    }
    expect(await list(matt)).toHaveLength(2);
  });

  it("works once", async () => {
    const matt = await staffMember("owner");
    const { device } = await register(matt);
    const confirmation = await confirm(matt, device, "passkey.add", "new");

    expect((await admin(matt, "POST", "/passkeys/options", { confirmation })).status).toBe(200);
    expect((await admin(matt, "POST", "/passkeys/options", { confirmation })).status).toBe(403);
  });

  it("refuses an answer from another site, an unverified one, and a replayed use count", async () => {
    const matt = await staffMember("owner");
    const { device, passkey } = await register(matt);
    // A good use first, so the stored count is above zero.
    await register(matt, "YubiKey", device);

    for (const flaws of [
      { origin: "https://admin.evil.example" },
      { unverified: true },
      { counter: 1 },
    ]) {
      const confirmation = await confirm(matt, device, "passkey.remove", passkey.id, flaws);
      const refused = await remove(matt, passkey, confirmation);
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ code: "confirmation_required" });
    }
    expect(await list(matt)).toHaveLength(2);
  });

  it("refuses someone else's challenge and someone else's passkey", async () => {
    const matt = await staffMember("owner");
    const dana = await staffMember("support");
    const mine = await register(matt);
    const theirs = await register(dana);

    const asked = await admin<Challenge>(dana, "POST", "/confirmations", {
      action: "passkey.remove",
      target: mine.passkey.id,
    });
    const borrowed = { id: asked.body.id, response: await mine.device.answer(asked.body.options) };
    expect((await remove(matt, mine.passkey, borrowed)).status).toBe(403);

    const own = await admin<Challenge>(matt, "POST", "/confirmations", {
      action: "passkey.remove",
      target: mine.passkey.id,
    });
    const forged = { id: own.body.id, response: await theirs.device.answer(own.body.options) };
    expect((await remove(matt, mine.passkey, forged)).status).toBe(403);
    expect(await list(matt)).toHaveLength(1);
  });

  it("refuses an expired challenge", async () => {
    const matt = await staffMember("owner");
    const { device, passkey } = await register(matt);
    const confirmation = await confirm(matt, device, "passkey.remove", passkey.id);
    await withDb((db) =>
      db
        .update(schema.staffConfirmations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(
          eq(schema.staffConfirmations.id, decodeId("confirmation", confirmation.id) as string),
        ),
    );
    expect((await remove(matt, passkey, confirmation)).status).toBe(403);
  });

  it("tells someone with no passkey to register one, where it can't be skipped", async () => {
    const matt = await staffMember("owner");
    const asked = await admin(
      matt,
      "POST",
      "/confirmations",
      { action: "passkey.add", target: "new" },
      { ENVIRONMENT: "production" },
    );
    expect(asked.status).toBe(403);
    expect(asked.body).toMatchObject({ code: "confirmation_required" });
    expect((asked.body as { hint: string }).hint).toContain("Passkeys screen");
  });

  it("can be skipped in local development, and nowhere else", async () => {
    const matt = await staffMember("owner");
    const { passkey } = await register(matt);
    const remove = (env: "local" | "production") =>
      admin(
        matt,
        "DELETE",
        `/passkeys/${passkey.id}`,
        { confirmation: SKIP },
        { ENVIRONMENT: env },
      );
    // Locally there is no Cloudflare Access: the portal says who you are.
    const ask = (who: Who, env: "local" | "production") =>
      admin<Challenge>(
        who,
        "POST",
        "/confirmations",
        { action: "passkey.remove", target: passkey.id },
        env === "local" ? { ENVIRONMENT: env, ACCESS_AUD: "" } : { ENVIRONMENT: env },
      );

    expect((await ask(matt, "production")).body.can_skip).toBe(false);
    expect((await remove("production")).body).toMatchObject({ code: "confirmation_required" });
    // Wherever Access is set up, even with ENVIRONMENT local, a passkey is needed.
    const withAccess = { ENVIRONMENT: "local" as const, ACCESS_AUD: AUD };
    const behindAccess = await admin<Challenge>(
      matt,
      "POST",
      "/confirmations",
      { action: "passkey.remove", target: passkey.id },
      withAccess,
    );
    expect(behindAccess.body.can_skip).toBe(false);
    const refused = await admin(
      matt,
      "DELETE",
      `/passkeys/${passkey.id}`,
      { confirmation: SKIP },
      withAccess,
    );
    expect(refused.body).toMatchObject({ code: "confirmation_required" });

    expect((await ask(matt, "local")).body.can_skip).toBe(true);
    // Locally, someone with no passkey is still offered the skip.
    const dana = await staffMember("support");
    expect((await ask(dana, "local")).body).toEqual({ id: null, options: null, can_skip: true });

    expect((await remove("local")).status).toBe(200);
    const [audit] = await staffAudit(matt, "staff.passkey_removed");
    expect(audit?.confirmedWith).toBeNull();
  });
});

describe("resetting someone's passkeys", () => {
  const reset = (who: Who, whose: Who, confirmation?: unknown) =>
    admin<{ removed: number }>(who, "DELETE", `/staff/${whose.id}/passkeys`, {
      reason: "Lost their laptop",
      confirmation,
    });

  it("is an owner's to do, confirmed with their own passkey", async () => {
    const matt = await staffMember("owner", "Matt");
    const dana = { ...(await staffMember("support", "Dana")) };
    const mine = await register(matt);
    const theirs = await register(dana);
    await register(dana, "Phone", theirs.device);
    const danaId = (
      await admin<{ data: { id: string; email: string }[] }>(matt, "GET", "/staff")
    ).body.data.find((row) => row.email === dana.email)?.id as string;
    const target = { ...dana, id: danaId };

    expect((await reset(dana, target)).status).toBe(403);
    expect((await reset(matt, target)).body).toMatchObject({ code: "confirmation_required" });

    const done = await reset(
      matt,
      target,
      await confirm(matt, mine.device, "staff.reset_passkeys", danaId),
    );
    expect(done).toMatchObject({ status: 200, body: { removed: 2 } });
    expect(await list(dana)).toEqual([]);
    const [audit] = await staffAudit(dana, "staff.passkeys_reset");
    expect(audit).toMatchObject({ actorId: matt.id, reason: "Lost their laptop" });

    // Back to their first: registered on trust again.
    await register(dana);
  });

  it("can't be done to yourself", async () => {
    const matt = await staffMember("owner");
    await register(matt);
    const me = (
      await admin<{ data: { id: string; is_you: boolean }[] }>(matt, "GET", "/staff")
    ).body.data.find((row) => row.is_you)?.id as string;
    const refused = await reset(matt, { ...matt, id: me });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: "forbidden" });
  });
});
