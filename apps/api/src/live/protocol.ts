/** What the API and a ConversationRoom (D-18) say to each other. Kept apart from the room itself,
 * which needs the Workers runtime, so the API's routes can be loaded anywhere (the OpenAPI script). */

export type Side = "salon" | "seeker";

/** What the API says about the person connecting. */
export interface Participant {
  side: Side;
  userId: string;
  /** Shown to the other side: "Willow & Ash is typing…", "Jess is typing…". */
  name: string;
}

/** Sent to the open views. */
export type LiveEvent =
  | { type: "message"; message: unknown }
  | { type: "typing"; from: Side; name: string };

/** How the API passes the room who's connecting. */
export const PARTICIPANT_HEADER = "X-Live-Participant";
