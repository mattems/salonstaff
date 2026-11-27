/**
 * The API, as the Worker reaches it. Deployed, over the `API` service binding to the
 * salonstaff-api Worker (no public hop, and the request keeps its headers). Locally the binding
 * usually isn't connected (the API runs on its own, `bunx wrangler dev` on localhost:8890), so
 * requests go there: always under `vite dev`, and under `vite preview` once the binding has
 * answered that its Worker isn't running.
 *
 * Server-only: imported by src/server.ts alone.
 */
import { env } from "cloudflare:workers";
import { LOCAL_API_ORIGIN } from "./site";

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

/** Headers that describe one hop, not the request, and never go further. */
const HOP_HEADERS = ["connection", "keep-alive", "transfer-encoding", "upgrade", "host"];

/** What a local binding answers when its Worker isn't running. Never seen deployed. */
const NOT_RUNNING = /^Worker ".+" not found/;

let bindingMissing = false;

function binding(): Fetcher | undefined {
  if (import.meta.env.DEV || bindingMissing) return undefined;
  return (env as { API?: Fetcher }).API;
}

/** A browser opening a WebSocket (a live conversation, D-18): forwarded with its upgrade. */
export function isWebSocket(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function forwardable(request: Request, target: URL): Request {
  const headers = new Headers(request.headers);
  const keep = isWebSocket(request) ? ["upgrade", "connection"] : [];
  for (const name of HOP_HEADERS) if (!keep.includes(name)) headers.delete(name);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    redirect: "manual",
  });
}

/** Forwards `request` to the API unchanged: method, path, query, headers and body. */
export async function fetchApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const local = new URL(`${url.pathname}${url.search}`, LOCAL_API_ORIGIN);
  const api = binding();
  let response: Response | undefined;
  if (api) {
    const canRetry = request.method === "GET" || request.method === "HEAD";
    response = await api.fetch(forwardable(request, url));
    if (canRetry && response.status === 503 && NOT_RUNNING.test(await response.clone().text())) {
      bindingMissing = true;
      response = undefined;
    }
  }
  response ??= await fetch(forwardable(request, local));
  // The API's end of the socket, passed straight back to the browser.
  // (Workers' own Response has `webSocket`; the types here are the browser's.)
  const socket = (response as { webSocket?: unknown }).webSocket;
  if (socket) return new Response(null, { status: 101, webSocket: socket } as ResponseInit);
  // A copy whose headers can still be changed on the way out.
  return new Response(response.body, response);
}
