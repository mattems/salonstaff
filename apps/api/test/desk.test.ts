/** D-20: jobs, applicants and conversations across every salon someone is on the team of. */
import { describe, expect, it } from "vitest";
import {
  asSalon,
  type MySalon,
  postJob,
  readySeeker,
  type SalonJob,
  salonInput,
  salonOwner,
} from "./fixtures";
import { createTestApp } from "./helpers";

interface Applicants {
  items: { id: string; salon: { id: string; name: string }; job: { id: string } }[];
  total: number;
}
interface Conversations {
  items: { salon: { id: string; name: string }; candidateId: string; unreadMessages: number }[];
}
type Jobs = { items: (SalonJob & { salon: { id: string; name: string } })[] };

describe("all your salons in one place", () => {
  it("lists jobs, applicants and conversations from each salon, and only yours", async () => {
    const app = createTestApp();
    const { owner, salon: first } = await salonOwner(app);
    const added = await owner.api<MySalon>("POST", "/v1/employer/salons", salonInput());
    expect(added.status).toBe(201);
    const second = added.body;
    // `asSalon` points a person at one salon: one caller for each.
    const atSecond = asSalon({ ...owner }, second.id);

    const firstJob = await postJob(owner);
    const secondJob = await postJob(atSecond);
    const draft = await postJob(atSecond, {}, false);

    // Someone else's salon stays out of it.
    const { owner: stranger } = await salonOwner(app);
    const theirs = await postJob(stranger);

    const jobs = await owner.api<Jobs>("GET", "/v1/employer/jobs");
    expect(jobs.status).toBe(200);
    expect(jobs.body.items.map((j) => j.id).sort()).toEqual(
      [firstJob.id, secondJob.id, draft.id].sort(),
    );
    expect(jobs.body.items.find((j) => j.id === secondJob.id)?.salon.name).toBe(second.name);
    const onlySecond = await owner.api<Jobs>("GET", `/v1/employer/jobs?salonId=${second.id}`);
    expect(onlySecond.body.items.map((j) => j.id).sort()).toEqual([secondJob.id, draft.id].sort());
    // A salon you're not on is a 404, not an empty list.
    const notYours = await owner.api("GET", `/v1/employer/jobs?salonId=${stranger.salonId}`);
    expect(notYours.status).toBe(404);

    const seeker = await readySeeker(app, "Desk");
    for (const job of [firstJob, secondJob, theirs]) {
      expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);
    }
    const applicants = await owner.api<Applicants>("GET", "/v1/employer/applicants");
    expect(applicants.status).toBe(200);
    expect(applicants.body.total).toBe(2);
    expect(applicants.body.items.map((a) => a.salon.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    const firstOnly = await owner.api<Applicants>(
      "GET",
      `/v1/employer/applicants?salonId=${first.id}`,
    );
    expect(firstOnly.body.items.map((a) => a.job.id)).toEqual([firstJob.id]);

    // A message from each salon: both conversations, each saying which salon.
    const candidateId = (
      await owner.api<Applicants & { items: { candidateId: string }[] }>(
        "GET",
        "/v1/employer/applicants",
      )
    ).body.items[0]?.candidateId as string;
    for (const at of [owner, atSecond]) {
      const sent = await at.api("POST", at.at(`/candidates/${candidateId}/messages`), {
        body: "Hi! Can you come in for a trial?",
      });
      expect(sent.status).toBe(201);
    }
    const conversations = await owner.api<Conversations>("GET", "/v1/employer/conversations");
    expect(conversations.body.items.map((c) => c.salon.name).sort()).toEqual(
      [first.name, second.name].sort(),
    );

    // The job seeker replies to one salon: that salon shows it unread.
    const inbox = await seeker.api<{ items: { id: string; salon: { id: string } }[] }>(
      "GET",
      "/v1/me/conversations",
    );
    const withSecond = inbox.body.items.find((c) => c.salon.id === second.id);
    expect(
      (
        await seeker.api("POST", `/v1/me/conversations/${withSecond?.id}/messages`, {
          body: "Yes please!",
        })
      ).status,
    ).toBe(201);
    const salons = await owner.api<{ items: (MySalon & { unreadMessages: number })[] }>(
      "GET",
      "/v1/employer/salons",
    );
    expect(Object.fromEntries(salons.body.items.map((s) => [s.id, s.unreadMessages]))).toEqual({
      [first.id]: 0,
      [second.id]: 1,
    });
  });
});
