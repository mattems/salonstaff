import { describe, expect, it } from "vitest";
import {
  asSalon,
  jobInput,
  type MySalon,
  postJob,
  readySeeker,
  type SalonJob,
  salonOwner,
} from "./fixtures";
import { createTestApp } from "./helpers";

type App = ReturnType<typeof createTestApp>;
type Team = {
  members: { userId: string; email: string | null; role: string; you: boolean }[];
  invites: { id: string; email: string; role: string }[];
};

/** The token in the last invite emailed to `to`. */
function inviteToken(app: App, to: string): string {
  const message = [...app.sent].reverse().find((m) => m.to === to);
  expect(message?.subject).toContain("Join ");
  return new URL(message?.text.match(/https?:\/\/\S+/)?.[0] as string).searchParams.get(
    "token",
  ) as string;
}

/** An owner, and someone they invited and who accepted, as `role`. */
async function ownerAndInvitee(app: App, role: "owner" | "manager" = "manager") {
  const { owner, salon } = await salonOwner(app);
  const person = await app.person("Invitee");
  const invited = await owner.api("POST", owner.at("/team/invites"), {
    email: person.email,
    role,
  });
  expect(invited.status).toBe(201);
  const accepted = await person.api<MySalon>(
    "POST",
    `/v1/invites/${inviteToken(app, person.email)}/accept`,
  );
  expect(accepted.status).toBe(200);
  expect(accepted.body).toMatchObject({ id: salon.id, role });
  return { owner, salon, invitee: asSalon(person, salon.id) };
}

describe("salon teams (D-11)", () => {
  it("invites someone by email, who accepts and becomes a manager", async () => {
    const app = createTestApp();
    const { owner, salon } = await salonOwner(app);
    const person = await app.person("Manny");
    const invited = await owner.api<{ id: string; role: string }>(
      "POST",
      owner.at("/team/invites"),
      { email: person.email.toUpperCase(), role: "manager" },
    );
    expect(invited.status).toBe(201);
    expect(invited.body.id).toMatch(/^inv_/);
    const token = inviteToken(app, person.email);

    // Anyone holding the link can see what it's for, before signing in.
    const preview = await app.call(`/v1/invites/${token}`);
    expect(await preview.json()).toMatchObject({
      salon: { name: salon.name },
      role: "manager",
      email: person.email,
    });
    expect(
      (await owner.api<Team>("GET", owner.at("/team"))).body.invites.map((i) => i.email),
    ).toEqual([person.email]);

    const accepted = await person.api<MySalon>("POST", `/v1/invites/${token}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ id: salon.id, role: "manager" });
    // Single use, and the account is an employer's now.
    expect((await person.api("POST", `/v1/invites/${token}/accept`)).status).toBe(400);
    const me = await person.api<{ role: string; salons: { id: string; role: string }[] }>(
      "GET",
      "/v1/me",
    );
    expect(me.body).toMatchObject({
      role: "employer",
      salons: [{ id: salon.id, role: "manager" }],
    });

    const team = await person.api<Team>("GET", `/v1/employer/salons/${salon.id}/team`);
    expect(team.body.members.map((m) => [m.role, m.you])).toEqual([
      ["owner", false],
      ["manager", true],
    ]);
    expect(team.body.invites).toEqual([]);
  });

  it("lets managers run jobs and applicants, and keeps details, billing and the team to owners", async () => {
    const app = createTestApp();
    const { owner, invitee: manager } = await ownerAndInvitee(app);
    const job = await postJob(manager, { title: "Posted by a manager" });
    expect(job.status).toBe("published");
    expect((await manager.api("POST", manager.at(`/jobs/${job.id}/close`))).status).toBe(200);
    expect((await manager.api("GET", manager.at(`/jobs/${job.id}/applicants`))).status).toBe(200);

    expect((await manager.api("PATCH", manager.at(), { about: "Managers can't" })).status).toBe(
      403,
    );
    expect((await manager.api("GET", manager.at("/billing"))).status).toBe(403);
    expect(
      (
        await manager.api("POST", manager.at("/team/invites"), {
          email: "someone@example.test",
          role: "owner",
        })
      ).status,
    ).toBe(403);
    const team = (await manager.api<Team>("GET", manager.at("/team"))).body;
    const ownerId = team.members.find((m) => m.role === "owner")?.userId as string;
    expect((await manager.api("DELETE", manager.at(`/team/${ownerId}`))).status).toBe(403);
    expect(
      (await manager.api("PATCH", manager.at(`/team/${ownerId}`), { role: "manager" })).status,
    ).toBe(403);
    expect((await owner.api("PATCH", owner.at(), { about: "Owners can" })).status).toBe(200);
  });

  it("always keeps an owner, and lets people leave", async () => {
    const app = createTestApp();
    const { owner, invitee } = await ownerAndInvitee(app);
    const team = (await owner.api<Team>("GET", owner.at("/team"))).body;
    const ownerId = team.members.find((m) => m.you)?.userId as string;
    const inviteeId = team.members.find((m) => !m.you)?.userId as string;

    // The only owner can't step down or leave.
    expect(
      (await owner.api("PATCH", owner.at(`/team/${ownerId}`), { role: "manager" })).status,
    ).toBe(409);
    expect((await owner.api("DELETE", owner.at(`/team/${ownerId}`))).status).toBe(409);

    // Hand over: promote the manager, then the first owner leaves.
    const promoted = await owner.api<Team>("PATCH", owner.at(`/team/${inviteeId}`), {
      role: "owner",
    });
    expect(promoted.body.members.map((m) => m.role)).toEqual(["owner", "owner"]);
    expect((await owner.api("DELETE", owner.at(`/team/${ownerId}`))).status).toBe(200);
    expect((await owner.api("GET", owner.at())).status).toBe(404);
    const left = await invitee.api<Team>("GET", invitee.at("/team"));
    expect(left.body.members.map((m) => [m.role, m.you])).toEqual([["owner", true]]);
  });

  it("invites as an owner, replaces and cancels invites", async () => {
    const app = createTestApp();
    const { owner, salon } = await salonOwner(app);
    const person = await app.person("Partner");
    await owner.api("POST", owner.at("/team/invites"), { email: person.email, role: "manager" });
    const firstToken = inviteToken(app, person.email);
    // Inviting the same address again replaces the first invite.
    await owner.api("POST", owner.at("/team/invites"), { email: person.email, role: "owner" });
    const secondToken = inviteToken(app, person.email);
    const pending = (await owner.api<Team>("GET", owner.at("/team"))).body.invites;
    expect(pending.map((i) => i.role)).toEqual(["owner"]);
    expect((await app.call(`/v1/invites/${firstToken}`)).status).toBe(400);

    const accepted = await person.api<MySalon>("POST", `/v1/invites/${secondToken}/accept`);
    expect(accepted.body.role).toBe("owner");
    // Already on the team: no second invite.
    expect(
      (await owner.api("POST", owner.at("/team/invites"), { email: person.email, role: "manager" }))
        .status,
    ).toBe(409);

    const other = await app.person("Never");
    await owner.api("POST", owner.at("/team/invites"), { email: other.email, role: "manager" });
    const token = inviteToken(app, other.email);
    const invite = (await owner.api<Team>("GET", owner.at("/team"))).body.invites[0];
    expect((await owner.api("DELETE", owner.at(`/team/invites/${invite?.id}`))).status).toBe(200);
    expect((await other.api("POST", `/v1/invites/${token}/accept`)).status).toBe(400);
    expect((await other.api("GET", `/v1/employer/salons/${salon.id}`)).status).toBe(404);
  });

  it("emails new applications to the people each job picks, or everyone", async () => {
    const app = createTestApp();
    const { owner, invitee: manager } = await ownerAndInvitee(app);
    const team = (await owner.api<Team>("GET", owner.at("/team"))).body;
    const managerId = team.members.find((m) => !m.you)?.userId as string;

    const everyone = await postJob(owner, { title: "Everyone hears" });
    expect(
      (await owner.api<SalonJob & { notifyUserIds: null }>("GET", owner.at(`/jobs/${everyone.id}`)))
        .body.notifyUserIds,
    ).toBeNull();
    const picked = await owner.api<SalonJob & { notifyUserIds: string[] }>(
      "POST",
      owner.at("/jobs"),
      {
        ...jobInput({ title: "Only the manager hears" }),
        publish: true,
        notifyUserIds: [managerId],
      },
    );
    expect(picked.status).toBe(201);
    expect(picked.body.notifyUserIds).toEqual([managerId]);
    expect(
      (
        await owner.api("PATCH", owner.at(`/jobs/${picked.body.id}`), {
          notifyUserIds: ["usr_00000000000000000000000000"],
        })
      ).status,
    ).toBe(400);

    const seeker = await readySeeker(app, "Applicant");
    const newApplicant = (to: string) =>
      app.sent.filter((m) => m.to === to && m.subject.startsWith("New verified applicant"));
    expect((await seeker.api("POST", `/v1/jobs/${everyone.id}/apply`, {})).status).toBe(201);
    expect(newApplicant(owner.email)).toHaveLength(1);
    expect(newApplicant(manager.email)).toHaveLength(1);
    expect((await seeker.api("POST", `/v1/jobs/${picked.body.id}/apply`, {})).status).toBe(201);
    expect(newApplicant(owner.email)).toHaveLength(1);
    expect(newApplicant(manager.email)).toHaveLength(2);
    expect(newApplicant(manager.email)[1]?.text).toContain(`/employer/${owner.salonId}/jobs/`);
  });

  it("keeps a salon when one of its owners deletes their account", async () => {
    const app = createTestApp();
    const { owner, invitee } = await ownerAndInvitee(app, "owner");
    expect((await owner.api("DELETE", "/v1/me")).status).toBe(200);
    const left = await invitee.api<Team>("GET", invitee.at("/team"));
    expect(left.status).toBe(200);
    expect(left.body.members.map((m) => [m.role, m.you])).toEqual([["owner", true]]);
  });
});
