/**
 * Live conversations (D-18): connecting an open conversation view to its ConversationRoom (one
 * per salon and job seeker, D-19: `roomOf` in @salonstaff/db), and telling the room about a new
 * message.
 */
import { ApiError } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { type LiveEvent, PARTICIPANT_HEADER, type Participant } from "../live/protocol";
import { allowedOrigins } from "./actor";

function room(c: Context<AppEnv>, name: string) {
  const rooms = c.env.CONVERSATIONS;
  return rooms.get(rooms.idFromName(name));
}

/**
 * Before anything else on a live route: it must be a WebSocket, and one opened with the website's
 * cookie must come from our own site (a browser sends the cookie whoever's page opens the socket).
 */
export function requireWebSocket(c: Context<AppEnv>) {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    throw new ApiError("validation_failed", {
      detail: "This address takes a WebSocket",
      hint: "Open it with `new WebSocket(...)` (it sends `Upgrade: websocket`). Read the conversation itself from the same path without `/live`.",
    });
  }
  const usesToken = c.req.header("Authorization")?.startsWith("Bearer ") ?? false;
  const origin = c.req.header("Origin");
  if (!usesToken && c.req.header("Cookie") && !(origin && allowedOrigins(c).includes(origin))) {
    throw new ApiError("forbidden", {
      detail: "Live conversations open only from Salon Staff itself",
      hint: "Open the conversation on the website or in the app.",
    });
  }
}

/** Hands the socket to the conversation's room, once the route has checked who's connecting. */
export async function connectLive(
  c: Context<AppEnv>,
  roomName: string,
  participant: Participant,
): Promise<Response> {
  const answer = await room(c, roomName).fetch("https://room/connect", {
    headers: { Upgrade: "websocket", [PARTICIPANT_HEADER]: JSON.stringify(participant) },
  });
  if (!answer.webSocket) return answer;
  // A fresh response: the middleware adds headers on the way out.
  return new Response(null, { status: 101, webSocket: answer.webSocket });
}

/**
 * Sends a new message to the conversation's open views. Returns the people who have it open, who
 * needn't be told by push or email. Never fails the request: if the room can't be reached, the
 * message is still saved and everyone is told the usual way.
 */
export async function broadcast(
  c: Context<AppEnv>,
  roomName: string,
  event: LiveEvent,
): Promise<Set<string>> {
  try {
    return new Set(await room(c, roomName).broadcast(event));
  } catch (error) {
    console.error("Live conversation unreachable", error);
    return new Set();
  }
}
