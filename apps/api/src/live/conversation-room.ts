/**
 * The live side of one application's conversation (D-18): a Durable Object per application that
 * the open conversation views of both sides (the applicant, the salon's team) connect to with a
 * WebSocket. The API tells it about each new message and it passes the message on at once; it
 * also passes on "typing…" between the two sides. It keeps nothing: the messages live in Postgres.
 *
 * Sockets hibernate between events, so an open conversation costs nothing while it's quiet.
 * Only the API Worker reaches it: it checks who's connecting before handing the socket over.
 */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import { type LiveEvent, PARTICIPANT_HEADER, type Participant, type Side } from "./protocol";

/** Frames bigger than this from a view are ignored: views only ever say they're typing. */
const MAX_FRAME = 256;

export class ConversationRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alives are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** A new view: the API has already checked who it is and that they can see the conversation. */
  override async fetch(request: Request): Promise<Response> {
    const participant = JSON.parse(
      request.headers.get(PARTICIPANT_HEADER) ?? "null",
    ) as Participant | null;
    if (!participant || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket from the API", { status: 400 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [participant.side, participant.userId]);
    server.serializeAttachment(participant);
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * A new message, to every open view (the sender's other tabs too; views ignore one they have).
   * Returns who has the conversation open, so the API can skip telling them by push and email.
   */
  async broadcast(event: LiveEvent): Promise<string[]> {
    const frame = JSON.stringify(event);
    const present = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(frame);
        present.add((socket.deserializeAttachment() as Participant).userId);
      } catch {
        // Already closing.
      }
    }
    return [...present];
  }

  /** A view says its person is typing: tell the other side's views. */
  override async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== "string" || data.length > MAX_FRAME) return;
    let parsed: { type?: unknown };
    try {
      parsed = JSON.parse(data) as { type?: unknown };
    } catch {
      return;
    }
    if (parsed.type !== "typing") return;
    const from = socket.deserializeAttachment() as Participant;
    const other: Side = from.side === "salon" ? "seeker" : "salon";
    const frame = JSON.stringify({ type: "typing", from: from.side, name: from.name });
    for (const peer of this.ctx.getWebSockets(other)) {
      try {
        peer.send(frame);
      } catch {
        // Already closing.
      }
    }
  }

  override async webSocketClose(socket: WebSocket) {
    try {
      socket.close(1000, "Bye");
    } catch {
      // Already closed.
    }
  }

  override async webSocketError(socket: WebSocket) {
    try {
      socket.close(1011, "Error");
    } catch {
      // Already closed.
    }
  }
}
