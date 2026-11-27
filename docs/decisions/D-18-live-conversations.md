# D-18 Conversations are live while they're open

**Status:** Accepted (2026-11-27)

**Decision.**

- **A Durable Object per application** (`ConversationRoom`, binding `CONVERSATIONS`) holds the WebSockets
  of every open view of that application's conversation (D-17): the applicant's, and anyone on the
  salon's team. It keeps no data; messages stay in Postgres.
- **Connecting:** `GET /v1/me/applications/{id}/live` and
  `GET /v1/employer/salons/{salonId}/applications/{id}/live` upgrade to a WebSocket after the usual
  checks (signed in, their application or their salon's). The website opens it on its own origin
  (`/api/...`, forwarded to the API with the cookie, from our own origin only); the app sends its bearer
  token. Sockets hibernate between events, so an open, quiet conversation costs nothing.
- **What travels:** a new message, to every open view as soon as it's saved (`{"type":"message"}`), and
  "typing…" to the other side (`{"type":"typing"}`, at most every 2.5 seconds, shown for 6). Views
  send `ping` every 25 seconds; the room answers `pong` without waking.
- **No double notice:** someone with the conversation open isn't also sent the push and email for a
  message. Views close their socket when the tab is hidden or the app goes to the background, so
  "open" means "looking at it"; they reconnect (and read the conversation again) when it's back.
- **One client for both:** `openLive` in `packages/shared` (reconnect with backoff, keep-alive,
  typing throttle) is used by the website and the app.

**Why.** Once a salon and an applicant are both in the conversation, waiting for a refresh or an email
breaks the exchange. Durable Objects are Cloudflare's way to hold sockets, need no other service, and run
locally under `wrangler dev`. Polling was simpler but slower and costs a query every few seconds per open
view.
