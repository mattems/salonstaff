/** D-17: the salon's list of applicants, and the conversation on an application. */
import { describe, expect, it } from "vitest";
import {
  type Person,
  postJob,
  profileInput,
  readySeeker,
  type SalonPerson,
  salonOwner,
  uid,
} from "./fixtures";
import { createTestApp } from "./helpers";

type App = ReturnType<typeof createTestApp>;

interface Applicants {
  items: {
    id: string;
    status: string;
    isNew: boolean;
    candidate: { firstName: string; lastName: string; yearsExperience: number | null } | null;
    job: { id: string; title: string };
    unreadMessages: number;
  }[];
  counts: Record<string, number>;
  total: number;
  truncated: boolean;
}

/** Keeps their name (a new one would expire their ID check) and changes their experience. */
async function setYears(person: Person, yearsExperience: number) {
  const { profile } = (
    await person.api<{ profile: { firstName: string; lastName: string } }>("GET", "/v1/me/profile")
  ).body;
  const saved = await person.api(
    "PUT",
    "/v1/me/profile",
    profileInput({ firstName: profile.firstName, lastName: profile.lastName, yearsExperience }),
  );
  expect(saved.status).toBe(200);
}

async function apply(person: Person, jobId: string) {
  const applied = await person.api<{ id: string }>("POST", `/v1/jobs/${jobId}/apply`, {});
  expect(applied.status).toBe(201);
}

const list = (owner: SalonPerson, query = "") =>
  owner.api<Applicants>("GET", owner.at(`/applicants${query}`));

async function applicationOf(owner: SalonPerson, jobId: string) {
  const found = await list(owner, `?jobId=${jobId}`);
  return found.body.items[0]?.id as string;
}

describe("a salon's applicants", () => {
  it("lists every job's applicants, filtered, sorted and counted", async () => {
    const app = createTestApp();
    const { owner } = await salonOwner(app);
    const colour = await postJob(owner, { title: `Colourist ${uid()}` });
    const barber = await postJob(owner, { title: `Barber ${uid()}` });
    const ana = await readySeeker(app, "Ana");
    const ben = await readySeeker(app, "Ben");
    await setYears(ana, 2);
    await setYears(ben, 12);
    await apply(ana, colour.id);
    await apply(ben, colour.id);
    await apply(ben, barber.id);

    const all = await list(owner);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(all.body.truncated).toBe(false);
    expect(all.body.items.every((i) => i.isNew)).toBe(true);
    // Seen now: no longer new, and counted as viewed.
    const again = await list(owner);
    expect(again.body.items.some((i) => i.isNew)).toBe(false);
    expect(again.body.counts).toMatchObject({ submitted: 0, viewed: 3 });

    const oneJob = await list(owner, `?jobId=${barber.id}`);
    expect(oneJob.body.items.map((i) => i.job.title)).toEqual([barber.title]);

    const benName = all.body.items.find((i) => i.candidate?.yearsExperience === 12)?.candidate
      ?.lastName as string;
    const byName = await list(owner, `?q=${encodeURIComponent(benName.toLowerCase())}`);
    expect(byName.body.items).toHaveLength(2);

    const experienced = await list(owner, "?sort=experience");
    expect(experienced.body.items.map((i) => i.candidate?.yearsExperience)).toEqual([12, 12, 2]);
    expect((await list(owner, "?minYears=10")).body.total).toBe(2);
    // Everyone here has a verified ID; nobody has had their work rights checked.
    expect((await list(owner, "?verified=identity")).body.total).toBe(3);
    expect((await list(owner, "?verified=identity,right_to_work")).body.total).toBe(0);
    expect((await list(owner, "?verified=passport")).status).toBe(400);

    const anaApp = all.body.items.find((i) => i.candidate?.yearsExperience === 2)?.id as string;
    await owner.api("PATCH", owner.at(`/applications/${anaApp}`), { status: "shortlisted" });
    const shortlisted = await list(owner, "?status=shortlisted");
    expect(shortlisted.body.items.map((i) => i.id)).toEqual([anaApp]);
    expect(shortlisted.body.counts).toMatchObject({ shortlisted: 1, viewed: 2 });

    // Another salon sees none of them.
    const other = await salonOwner(app);
    expect((await list(other.owner)).body.total).toBe(0);
    expect((await other.owner.api("GET", other.owner.at(`/applications/${anaApp}`))).status).toBe(
      404,
    );
  });
});

describe("the conversation on an application", () => {
  async function setup(app: App) {
    const { owner, salon } = await salonOwner(app);
    const job = await postJob(owner, { title: `Stylist ${uid()}` });
    const seeker = await readySeeker(app, "Chat");
    await apply(seeker, job.id);
    const applicationId = await applicationOf(owner, job.id);
    return { owner, salon, job, seeker, applicationId };
  }

  it("lets the salon write, tells the applicant, and lets them reply", async () => {
    const app = createTestApp();
    const { owner, salon, job, seeker, applicationId } = await setup(app);

    // The applicant waits for the salon to write first.
    const early = await seeker.api("POST", `/v1/me/applications/${applicationId}/messages`, {
      body: "Hello?",
    });
    expect(early.status).toBe(409);
    const before = await seeker.api<{ canSend: boolean; sendHint: string | null }>(
      "GET",
      `/v1/me/applications/${applicationId}`,
    );
    expect(before.body).toMatchObject({ canSend: false });
    expect(before.body.sendHint).toContain("once the salon writes");

    const text = `Could you come in for a trial on Saturday? ${uid()}`;
    const sent = await owner.api<{ from: string; body: string }>(
      "POST",
      owner.at(`/applications/${applicationId}/messages`),
      { body: text },
    );
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ from: "salon", body: text });
    const mail = app.sent.findLast((m) => m.to === seeker.email);
    expect(mail?.subject).toBe(`${salon.name} sent you a message about ${job.title}`);
    expect(mail?.text).toContain(text);
    expect(mail?.replyTo).toBeUndefined();

    const me = await seeker.api<{ unreadMessages: number }>("GET", "/v1/me");
    expect(me.body.unreadMessages).toBe(1);
    const conversations = await seeker.api<{
      items: { id: string; unreadMessages: number; lastMessage: { body: string } }[];
    }>("GET", "/v1/me/conversations");
    expect(conversations.body.items).toEqual([
      expect.objectContaining({
        id: applicationId,
        unreadMessages: 1,
        lastMessage: expect.objectContaining({ body: text }),
      }),
    ]);
    const opened = await seeker.api<{ messages: { body: string }[]; canSend: boolean }>(
      "GET",
      `/v1/me/applications/${applicationId}`,
    );
    expect(opened.body.messages.map((m) => m.body)).toEqual([text]);
    expect(opened.body.canSend).toBe(true);
    expect(
      (await seeker.api<{ unreadMessages: number }>("GET", "/v1/me")).body.unreadMessages,
    ).toBe(0);

    const reply = `Saturday works, see you at 10. ${uid()}`;
    const replied = await seeker.api("POST", `/v1/me/applications/${applicationId}/messages`, {
      body: reply,
    });
    expect(replied.status).toBe(201);
    const told = app.sent.findLast((m) => m.to === owner.email);
    expect(told?.subject).toContain(`replied about ${job.title}`);
    expect(told?.text).toContain(reply);

    const salonView = await owner.api<{ unreadMessages: number }>("GET", owner.at());
    expect(salonView.body.unreadMessages).toBe(1);
    expect((await list(owner, "?unread=true")).body.items.map((i) => i.id)).toEqual([
      applicationId,
    ]);
    const thread = await owner.api<{ messages: { from: string }[]; canSend: boolean }>(
      "GET",
      owner.at(`/applications/${applicationId}`),
    );
    expect(thread.body.messages.map((m) => m.from)).toEqual(["salon", "seeker"]);
    expect(
      (await owner.api<{ unreadMessages: number }>("GET", owner.at())).body.unreadMessages,
    ).toBe(0);

    // Nobody else can read it.
    const stranger = await readySeeker(app, "Stranger");
    expect((await stranger.api("GET", `/v1/me/applications/${applicationId}`)).status).toBe(404);
  });

  it("has no daily limit, but won't send an empty message", async () => {
    const app = createTestApp();
    const { owner, applicationId } = await setup(app);
    // More than the 20 a day there used to be.
    for (let i = 0; i < 21; i++) {
      const sent = await owner.api("POST", owner.at(`/applications/${applicationId}/messages`), {
        body: `Message ${i}`,
      });
      expect(sent.status).toBe(201);
    }
    expect(
      (await owner.api("POST", owner.at(`/applications/${applicationId}/messages`), { body: "  " }))
        .status,
    ).toBe(400);
  });
});
