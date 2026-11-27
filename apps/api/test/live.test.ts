/** D-18: live conversations over a WebSocket, through each application's ConversationRoom. */
import { describe, expect, it } from "vitest";
import { type Person, postJob, readySeeker, type SalonPerson, salonOwner, uid } from "./fixtures";
import { APP_ORIGIN, createTestApp } from "./helpers";

type App = ReturnType<typeof createTestApp>;

async function setup(app: App) {
  const { owner, salon } = await salonOwner(app);
  const job = await postJob(owner, { title: `Stylist ${uid()}` });
  const seeker = await readySeeker(app, "Live");
  expect((await seeker.api("POST", `/v1/jobs/${job.id}/apply`, {})).status).toBe(201);
  const found = await owner.api<{ items: { id: string }[] }>(
    "GET",
    owner.at(`/applicants?jobId=${job.id}`),
  );
  return { owner, salon, job, seeker, applicationId: found.body.items[0]?.id as string };
}

/** Opens a live conversation as `person`, the way the website does (cookie, our own origin). */
function connect(app: App, person: Person, path: string, headers: Record<string, string> = {}) {
  return app.call(path, {
    headers: { Cookie: person.cookie, Origin: APP_ORIGIN, Upgrade: "websocket", ...headers },
  });
}

/** The socket's frames, as they arrive. */
function listen(response: Response) {
  const socket = response.webSocket;
  if (!socket) throw new Error(`No socket: ${response.status}`);
  socket.accept();
  const frames: unknown[] = [];
  const waiters: (() => void)[] = [];
  socket.addEventListener("message", (event) => {
    frames.push(event.data === "pong" ? "pong" : JSON.parse(event.data as string));
    for (const wake of waiters.splice(0)) wake();
  });
  async function next(): Promise<unknown> {
    const seen = frames.length;
    const deadline = Date.now() + 2_000;
    while (frames.length === seen) {
      if (Date.now() > deadline) throw new Error("No frame arrived");
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
    return frames.at(-1);
  }
  return { socket, frames, next };
}

const seekerLive = (applicationId: string) => `/v1/me/applications/${applicationId}/live`;
const salonLive = (owner: SalonPerson, applicationId: string) =>
  owner.at(`/applications/${applicationId}/live`);

describe("a live conversation", () => {
  it("takes only a WebSocket, from someone who can see the conversation", async () => {
    const app = createTestApp();
    const { owner, seeker, applicationId } = await setup(app);

    const plain = await seeker.api("GET", seekerLive(applicationId));
    expect(plain.status).toBe(400);

    const stranger = await readySeeker(app, "Stranger");
    expect((await connect(app, stranger, seekerLive(applicationId))).status).toBe(404);
    const otherSalon = await salonOwner(app);
    expect(
      (await connect(app, otherSalon.owner, salonLive(otherSalon.owner, applicationId))).status,
    ).toBe(404);

    // Another site's page can't open it with the website's cookie.
    const forged = await connect(app, seeker, seekerLive(applicationId), {
      Origin: "https://elsewhere.example",
    });
    expect(forged.status).toBe(403);

    const signedOut = await app.call(seekerLive(applicationId), {
      headers: { Upgrade: "websocket" },
    });
    expect(signedOut.status).toBe(401);

    expect((await connect(app, owner, salonLive(owner, applicationId))).status).toBe(101);
  });

  it("passes on new messages and typing, and skips the email to someone watching", async () => {
    const app = createTestApp();
    const { owner, salon, seeker, applicationId } = await setup(app);
    const theirs = listen(await connect(app, seeker, seekerLive(applicationId)));
    const ours = listen(await connect(app, owner, salonLive(owner, applicationId)));

    theirs.socket.send("ping");
    expect(await theirs.next()).toBe("pong");

    const text = `Can you do a trial on Tuesday? ${uid()}`;
    const arriving = theirs.next();
    const sent = await owner.api<{ id: string }>(
      "POST",
      owner.at(`/applications/${applicationId}/messages`),
      { body: text },
    );
    expect(sent.status).toBe(201);
    expect(await arriving).toMatchObject({
      type: "message",
      message: { id: sent.body.id, from: "salon", body: text },
    });
    // They saw it arrive, so no email about it.
    expect(app.sent.some((m) => m.to === seeker.email && m.text.includes(text))).toBe(false);

    // Typing reaches the other side only.
    const typing = ours.next();
    theirs.socket.send(JSON.stringify({ type: "typing" }));
    expect(await typing).toMatchObject({ type: "typing", from: "seeker" });
    ours.socket.send(JSON.stringify({ type: "typing" }));
    expect(await theirs.next()).toEqual({ type: "typing", from: "salon", name: salon.name });

    // Once they've left, the next message is emailed as usual.
    theirs.socket.close(1000);
    ours.socket.close(1000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const later = `And bring your kit ${uid()}`;
    await owner.api("POST", owner.at(`/applications/${applicationId}/messages`), { body: later });
    expect(app.sent.some((m) => m.to === seeker.email && m.text.includes(later))).toBe(true);
  });
});
