/**
 * The Worker's entry. TanStack Start renders every page and runs the server routes
 * (/api/*, /sitemap.xml, /robots.txt); this adds what a Worker page needs around that:
 *  - the request context for loaders (the cookie to forward, the API binding), and
 *  - security headers, with a fresh CSP nonce per page for the framework's inline scripts.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { securityHeaderLines } from "@salonstaff/config/security-headers";
import handler from "@tanstack/react-start/server-entry";
import { installServerHooks, type ServerContext } from "./lib/server-context";
import { MEDIA_ORIGIN } from "./lib/site";
import { fetchApi } from "./lib/upstream";

const context = new AsyncLocalStorage<ServerContext>();
installServerHooks({ current: () => context.getStore(), fetchApi });

/** Pages that are nobody's business but the person signed in. */
const PRIVATE_PATHS = ["/account", "/employer", "/sign-in", "/claim", "/dev"];

function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function withSecurityHeaders(request: Request, response: Response, nonce: string): Response {
  const path = new URL(request.url).pathname;
  // The API's answers carry their own headers; the dev server needs its own inline scripts.
  if (path === "/api" || path.startsWith("/api/") || import.meta.env.DEV) return response;
  const out = new Response(response.body, response);
  const isPrivate = PRIVATE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  for (const line of securityHeaderLines({
    images: [MEDIA_ORIGIN.production],
    nonce,
    noindex: isPrivate,
  })) {
    const at = line.indexOf(": ");
    out.headers.set(line.slice(0, at), line.slice(at + 2));
  }
  return out;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const nonce = newNonce();
    const response = await context.run({ request, nonce }, () => handler.fetch(request));
    return withSecurityHeaders(request, response, nonce);
  },
};
