/**
 * The API reference at /docs. It is the one page the API serves, and it runs a third-party
 * script, on an origin that carries the session cookie. So the script is pinned to a version
 * and a hash, the page gets a content security policy that allows only that script and the
 * inline line that starts it, and "try it" requests go straight to us, never through Scalar's
 * proxy (docs/security-audit.md).
 */

import { BRAND } from "@salonstaff/shared";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import type { AppEnv } from "../env";

/** The exact file, not the package root: jsDelivr re-minifies the root, which would break the hash. */
export const SCALAR_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.1/dist/browser/standalone.js";
/** `openssl dgst -sha384 -binary standalone.js | base64`. Change it with the version. */
export const SCALAR_INTEGRITY =
  "sha384-kYDGzV91Jnn3TbHINV3nt54riK2uMJDfN5Al8dAkz4FssELTBWbD8rgw32sTKfOi";

export function docsPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    // The viewer sets inline style attributes; a nonce can't cover those.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src blob:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export const docs = new Hono<AppEnv>();

docs.get("/docs", async (c) => {
  const nonce = newNonce();
  const page = Scalar({
    url: "/v1/openapi.json",
    pageTitle: `${BRAND.name} API reference`,
    cdn: SCALAR_SCRIPT,
    nonce,
    // Straight to the API: a token typed into "try it" must not pass through anyone else.
    proxyUrl: "",
    withDefaultFonts: false,
  });
  // The middleware's context type is the generic one; it only reads the request and writes HTML.
  const rendered = (await page(
    c as unknown as Parameters<typeof page>[0],
    async () => {},
  )) as Response;
  const html = (await rendered.text()).replace(
    `src="${SCALAR_SCRIPT}"`,
    `src="${SCALAR_SCRIPT}" integrity="${SCALAR_INTEGRITY}" crossorigin="anonymous"`,
  );
  // If an upgrade changes the markup, don't quietly serve the script unpinned.
  if (!html.includes(`integrity="${SCALAR_INTEGRITY}"`)) {
    throw new Error("The API reference's script tag couldn't be pinned (routes/docs.ts)");
  }
  c.header("Content-Security-Policy", docsPolicy(nonce));
  return c.html(html);
});
