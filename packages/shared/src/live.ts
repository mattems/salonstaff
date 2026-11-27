/**
 * Live conversations (D-18), for the website and the app alike: keeps a conversation's WebSocket
 * open while it's on screen, reconnects after a drop, and sends "typing…" no more than it needs to.
 * Takes whatever WebSocket the platform has; nothing here touches the page or the screen.
 */

export type LiveSide = "salon" | "seeker";

/** What the API sends down the socket. */
export type LiveEvent<M> =
  | { type: "message"; message: M }
  | { type: "typing"; from: LiveSide; name: string };

export const LIVE_TIMING = {
  /** A view says its person is still typing at most this often. */
  typingEveryMs: 2_500,
  /** "Jess is typing…" disappears this long after the last word that she was. */
  typingShownForMs: 6_000,
  /** Keep-alive, so phone networks and proxies don't drop a quiet socket. */
  pingEveryMs: 25_000,
  firstRetryMs: 1_000,
  maxRetryMs: 30_000,
} as const;

/** How long to wait before reconnecting, after `attempt` failed tries in a row (from 0). */
export function reconnectDelay(attempt: number, random = Math.random()): number {
  const base = Math.min(LIVE_TIMING.maxRetryMs, LIVE_TIMING.firstRetryMs * 2 ** attempt);
  // Up to a quarter either way, so a room full of views doesn't reconnect all at once.
  return Math.round(base * (0.75 + random * 0.5));
}

/** The parts of a WebSocket used here: the browser's and React Native's both fit. */
export interface LiveSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: never) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: never) => void) | null;
  onerror: ((event: never) => void) | null;
}

export interface LiveHandlers<M> {
  onMessage(message: M): void;
  onTyping(name: string, from: LiveSide): void;
  /** Back after a drop: read the conversation again, for anything sent in between. */
  onReconnect(): void;
  onConnected?(connected: boolean): void;
}

const OPEN = 1;

/** Opens the conversation's socket (`open` makes a new one each time) until `close()`. */
export function openLive<M>(open: () => LiveSocket, handlers: LiveHandlers<M>) {
  let socket: LiveSocket | null = null;
  let closed = false;
  let attempts = 0;
  let everConnected = false;
  let lastTyping = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  function connect() {
    if (closed) return;
    const current = open();
    socket = current;
    current.onopen = () => {
      attempts = 0;
      handlers.onConnected?.(true);
      if (everConnected) handlers.onReconnect();
      everConnected = true;
      ping = setInterval(() => {
        if (current.readyState === OPEN) current.send("ping");
      }, LIVE_TIMING.pingEveryMs);
    };
    current.onmessage = ({ data }) => {
      if (typeof data !== "string" || data === "pong") return;
      let event: LiveEvent<M>;
      try {
        event = JSON.parse(data) as LiveEvent<M>;
      } catch {
        return;
      }
      if (event.type === "message") handlers.onMessage(event.message);
      else if (event.type === "typing") handlers.onTyping(event.name, event.from);
    };
    current.onclose = () => {
      clearInterval(ping);
      if (socket !== current) return;
      socket = null;
      handlers.onConnected?.(false);
      if (closed) return;
      retry = setTimeout(connect, reconnectDelay(attempts));
      attempts += 1;
    };
    // A failed socket closes too; onclose retries.
    current.onerror = () => {};
  }

  connect();

  return {
    /** Their person typed: tells the other side, at most every few seconds. */
    typing() {
      const now = Date.now();
      if (now - lastTyping < LIVE_TIMING.typingEveryMs || socket?.readyState !== OPEN) return;
      lastTyping = now;
      socket.send(JSON.stringify({ type: "typing" }));
    },
    /** They sent a message: the next keystroke is news again. */
    sent() {
      lastTyping = 0;
    },
    close() {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      const current = socket;
      socket = null;
      current?.close(1000, "Left the conversation");
    },
  };
}

export type LiveConnection = ReturnType<typeof openLive>;

/** The conversation's messages with one more, unless it's already there, oldest first. */
export function withMessage<M extends { id: string; createdAt: string }>(
  messages: M[],
  message: M,
): M[] {
  if (messages.some((m) => m.id === message.id)) return messages;
  return [...messages, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
