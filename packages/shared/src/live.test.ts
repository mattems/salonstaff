import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_TIMING, type LiveSocket, openLive, reconnectDelay, withMessage } from "./live";

describe("reconnectDelay", () => {
  it.each([
    [0, 0.5, 1_000],
    [1, 0.5, 2_000],
    [4, 0.5, 16_000],
    [5, 0.5, 30_000],
    [20, 0.5, 30_000],
    [0, 0, 750],
    [0, 1, 1_250],
  ])("after %i failures (random %d) waits %i ms", (attempt, random, ms) => {
    expect(reconnectDelay(attempt, random)).toBe(ms);
  });
});

describe("withMessage", () => {
  const a = { id: "msg_a", createdAt: "2026-11-27T01:00:00.000Z" };
  const b = { id: "msg_b", createdAt: "2026-11-27T02:00:00.000Z" };
  it("adds a new one in order", () => {
    expect(withMessage([b], a)).toEqual([a, b]);
  });
  it("leaves one it already has", () => {
    const list = [a, b];
    expect(withMessage(list, a)).toBe(list);
  });
});

class FakeSocket implements LiveSocket {
  readyState = 0;
  sent: string[] = [];
  closedWith: number | undefined;
  onopen: ((event: never) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: never) => void) | null = null;
  onerror: ((event: never) => void) | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.drop();
  }
  opened() {
    this.readyState = 1;
    this.onopen?.(undefined as never);
  }
  drop() {
    this.readyState = 3;
    this.onclose?.(undefined as never);
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
}

describe("openLive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const sockets: FakeSocket[] = [];
    const handlers = {
      onMessage: vi.fn(),
      onTyping: vi.fn(),
      onReconnect: vi.fn(),
      onConnected: vi.fn(),
    };
    const live = openLive(() => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }, handlers);
    return { sockets, handlers, live };
  }

  it("passes on messages and typing, and ignores the rest", () => {
    const { sockets, handlers } = setup();
    const socket = sockets[0] as FakeSocket;
    socket.opened();
    socket.receive(JSON.stringify({ type: "message", message: { id: "msg_1" } }));
    socket.receive(JSON.stringify({ type: "typing", from: "seeker", name: "Jess" }));
    socket.receive("pong");
    socket.receive("not json");
    expect(handlers.onMessage).toHaveBeenCalledWith({ id: "msg_1" });
    expect(handlers.onTyping).toHaveBeenCalledWith("Jess", "seeker");
    expect(handlers.onReconnect).not.toHaveBeenCalled();
  });

  it("says it's typing at most every few seconds, and again after sending", () => {
    const { sockets, live } = setup();
    const socket = sockets[0] as FakeSocket;
    live.typing(); // Not open yet: nothing to say it on.
    socket.opened();
    live.typing();
    live.typing();
    vi.advanceTimersByTime(LIVE_TIMING.typingEveryMs);
    live.typing();
    live.sent();
    live.typing();
    expect(socket.sent.filter((s) => s.includes("typing"))).toHaveLength(3);
  });

  it("reconnects after a drop, and asks for a re-read once back", () => {
    const { sockets, handlers } = setup();
    (sockets[0] as FakeSocket).opened();
    (sockets[0] as FakeSocket).drop();
    expect(handlers.onConnected).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(LIVE_TIMING.firstRetryMs * 1.25);
    expect(sockets).toHaveLength(2);
    (sockets[1] as FakeSocket).opened();
    expect(handlers.onReconnect).toHaveBeenCalledOnce();
  });

  it("keeps the socket alive, and stops for good when closed", () => {
    const { sockets, live } = setup();
    const socket = sockets[0] as FakeSocket;
    socket.opened();
    vi.advanceTimersByTime(LIVE_TIMING.pingEveryMs);
    expect(socket.sent).toContain("ping");
    live.close();
    expect(socket.closedWith).toBe(1000);
    vi.advanceTimersByTime(LIVE_TIMING.maxRetryMs * 2);
    expect(sockets).toHaveLength(1);
  });
});
