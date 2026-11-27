/** D-17, D-19: the salon's list of applicants, and the one conversation between a salon and a job seeker. */
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
    candidateId: string;
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

interface Message {
  from: string;
  kind: string;
  body: string;
  about: { applicationId: string; jobTitle: string } | null;
}

describe("the conversation between a salon and a job seeker", () => {
  async function setup(app: App) {
    const { owner, salon } = await salonOwner(app);
    const first = await postJob(owner, { title: `Stylist ${uid()}` });
    const second = await postJob(owner, { title: `Colourist ${uid()}` });
    const seeker = await readySeeker(app, "Chat");
    await apply(seeker, first.id);
    await apply(seeker, second.id);
    const all = (await list(owner)).body.items;
    const firstApp = all.find((i) => i.job.id === first.id) as Applicants["items"][number];
    const secondApp = all.find((i) => i.job.id === second.id) as Applicants["items"][number];
    const write = (body: string, applicationId?: string) =>
      owner.api<Message>("POST", owner.at(`/candidates/${firstApp.candidateId}/messages`), {
        body,
        ...(applicationId ? { applicationId } : {}),
      });
    return { owner, salon, first, second, seeker, firstApp, secondApp, write };
  }

  it("is one thread for every application, told to the other side, with replies", async () => {
    const app = createTestApp();
    const { owner, salon, first, second, seeker, firstApp, secondApp, write } = await setup(app);

    // No conversation until the salon writes.
    const before = await seeker.api<{ conversationId: string | null; unreadMessages: number }>(
      "GET",
      `/v1/me/applications/${firstApp.id}`,
    );
    expect(before.body).toMatchObject({ conversationId: null, unreadMessages: 0 });

    const text = `Could you come in for a trial on Saturday? ${uid()}`;
    const sent = await write(text, firstApp.id);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      from: "salon",
      kind: "text",
      body: text,
      about: { applicationId: firstApp.id, jobTitle: first.title },
    });
    const mail = app.sent.findLast((m) => m.to === seeker.email);
    expect(mail?.subject).toBe(`${salon.name} sent you a message about ${first.title}`);
    expect(mail?.text).toContain(text);
    expect(mail?.replyTo).toBeUndefined();

    const me = await seeker.api<{ unreadMessages: number }>("GET", "/v1/me");
    expect(me.body.unreadMessages).toBe(1);
    const conversations = await seeker.api<{
      items: { id: string; unreadMessages: number; salon: { name: string } }[];
    }>("GET", "/v1/me/conversations");
    expect(conversations.body.items).toHaveLength(1);
    const conversation = conversations.body.items[0] as (typeof conversations.body.items)[number];
    expect(conversation).toMatchObject({ unreadMessages: 1, salon: { name: salon.name } });
    expect(conversation.id).toMatch(/^cnv_/);

    // Both applications point to the same conversation, unread until it's opened.
    for (const application of [firstApp, secondApp]) {
      const seen = await seeker.api<{ conversationId: string; unreadMessages: number }>(
        "GET",
        `/v1/me/applications/${application.id}`,
      );
      expect(seen.body).toEqual(
        expect.objectContaining({ conversationId: conversation.id, unreadMessages: 1 }),
      );
    }

    const opened = await seeker.api<{
      applications: { jobTitle: string }[];
      messages: Message[];
      canSend: boolean;
    }>("GET", `/v1/me/conversations/${conversation.id}`);
    expect(opened.body.messages.map((m) => m.body)).toEqual([text]);
    expect(
      (await seeker.api<{ unreadMessages: number }>("GET", "/v1/me")).body.unreadMessages,
    ).toBe(0);
    expect(opened.body.applications.map((a) => a.jobTitle).sort()).toEqual(
      [first.title, second.title].sort(),
    );
    expect(opened.body.canSend).toBe(true);

    const reply = `Saturday works, and I'd love the colourist job too. ${uid()}`;
    const replied = await seeker.api<Message>(
      "POST",
      `/v1/me/conversations/${conversation.id}/messages`,
      { body: reply, applicationId: secondApp.id },
    );
    expect(replied.status).toBe(201);
    expect(replied.body.about?.jobTitle).toBe(second.title);
    const told = app.sent.findLast((m) => m.to === owner.email);
    expect(told?.subject).toContain(`replied about ${second.title}`);
    expect(told?.text).toContain(reply);
    // Without an application, a reply follows the salon's last message.
    const followed = await seeker.api<Message>(
      "POST",
      `/v1/me/conversations/${conversation.id}/messages`,
      { body: "See you then." },
    );
    expect(followed.body.about?.jobTitle).toBe(first.title);

    const salonView = await owner.api<{ unreadMessages: number }>("GET", owner.at());
    expect(salonView.body.unreadMessages).toBe(1);
    // Unread on both of their applications: it's the one conversation.
    expect((await list(owner, "?unread=true")).body.items.map((i) => i.id).sort()).toEqual(
      [firstApp.id, secondApp.id].sort(),
    );
    const salonList = await owner.api<{
      items: { candidateId: string; unreadMessages: number }[];
    }>("GET", owner.at("/conversations"));
    expect(salonList.body.items).toEqual([
      expect.objectContaining({ candidateId: firstApp.candidateId, unreadMessages: 2 }),
    ]);
    const thread = await owner.api<{ messages: Message[]; applications: unknown[] }>(
      "GET",
      owner.at(`/candidates/${firstApp.candidateId}/conversation`),
    );
    expect(thread.body.messages.map((m) => m.from)).toEqual(["salon", "seeker", "seeker"]);
    expect(thread.body.applications).toHaveLength(2);
    expect(
      (await owner.api<{ unreadMessages: number }>("GET", owner.at())).body.unreadMessages,
    ).toBe(0);
    // The application says how many are unread; it doesn't open the conversation.
    await seeker.api("POST", `/v1/me/conversations/${conversation.id}/messages`, {
      body: "One more thing.",
    });
    const onApplication = await owner.api<{ unreadMessages: number; candidateId: string }>(
      "GET",
      owner.at(`/applications/${secondApp.id}`),
    );
    expect(onApplication.body).toMatchObject({
      unreadMessages: 1,
      candidateId: firstApp.candidateId,
    });
    expect(
      (await owner.api<{ unreadMessages: number }>("GET", owner.at())).body.unreadMessages,
    ).toBe(1);

    // Nobody else can read it, or write about an application that isn't between them.
    const stranger = await readySeeker(app, "Stranger");
    expect((await stranger.api("GET", `/v1/me/conversations/${conversation.id}`)).status).toBe(404);
    const elsewhere = await salonOwner(app);
    const theirs = await postJob(elsewhere.owner, { title: `Barber ${uid()}` });
    await apply(seeker, theirs.id);
    const theirApp = (await list(elsewhere.owner)).body.items[0]?.id as string;
    expect((await write("About that other job", theirApp)).status).toBe(400);
  });

  it("has no daily limit once they've applied, but won't send an empty message", async () => {
    const app = createTestApp();
    const { write } = await setup(app);
    // More than the 20 a day there used to be.
    for (let i = 0; i < 21; i++) expect((await write(`Message ${i}`)).status).toBe(201);
    expect((await write("  ")).status).toBe(400);
  });
});
