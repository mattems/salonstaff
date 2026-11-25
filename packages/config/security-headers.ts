/**
 * A Vite plugin that writes a `_headers` file into the build, which
 * Cloudflare applies to every file it serves for the app. The policy is
 * built here, not hand-written per app, so the two web apps can't drift.
 *
 * The content security policy is the important one: the page may only run
 * scripts it was built with and only talk to the origins named here, so an
 * injected script has nowhere to load from and nowhere to send data.
 */
import type { Plugin } from "vite";

export interface SecurityHeadersOptions {
  /** Origins the app calls besides its own, e.g. the API. */
  connect?: string[];
  /** Origins images may come from besides its own: where uploaded pictures are served. */
  images?: string[];
  /** Origins scripts may come from besides its own: the status widget, for its preview. */
  scripts?: string[];
  /** Origins the app may frame: the Assistant's panel, for its preview (D-41). */
  frames?: string[];
  /**
   * Tell search engines to keep every page out of their results. A header
   * covers what a `<meta>` tag can't: scripts, images and any other file.
   */
  noindex?: boolean;
  /**
   * `sha256-…` hashes of inline scripts the page may run: the docs' (Starlight writes its
   * own). Only those exact scripts run; any other inline script is still blocked.
   */
  scriptHashes?: string[];
  /**
   * A fresh random value per response, for a server-rendered page: its own inline scripts (the
   * framework's hydration data) carry it and run; any other inline script is still blocked.
   */
  nonce?: string;
  /** Allow WebAssembly, which the docs' search (Pagefind) runs. It allows no `eval`. */
  wasm?: boolean;
  /** Files with no extension to say a type for: the app links files under `/.well-known/`. */
  json?: string[];
}

/**
 * Cloudflare Web Analytics. Cloudflare adds its beacon script to our pages
 * itself (a setting on the zone), so the policy has to allow it or the
 * browser blocks it and logs an error on every page. Cloudflare already serves
 * every byte of these apps, so this trusts nobody new.
 */
const ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com";
const ANALYTICS_REPORT = "https://cloudflareinsights.com";

export function securityHeaderLines(options: SecurityHeadersOptions = {}): string[] {
  const connect = ["'self'", ...(options.connect ?? []), ANALYTICS_REPORT].join(" ");
  const script = [
    "'self'",
    ...(options.wasm ? ["'wasm-unsafe-eval'"] : []),
    ...(options.scriptHashes ?? []).map((hash) => `'${hash}'`),
    ...(options.nonce ? [`'nonce-${options.nonce}'`] : []),
    ...(options.scripts ?? []),
    ANALYTICS_SCRIPT,
  ].join(" ");
  const policy = [
    "default-src 'self'",
    `script-src ${script}`,
    // Component libraries set inline styles (positions, sizes). Inline scripts stay blocked.
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data:", ...(options.images ?? [])].join(" "),
    "font-src 'self'",
    ...(options.frames?.length ? [`frame-src 'self' ${options.frames.join(" ")}`] : []),
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return [
    `Content-Security-Policy: ${policy}`,
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "X-Frame-Options: DENY",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
    ...(options.noindex ? ["X-Robots-Tag: noindex, nofollow"] : []),
  ];
}

export function securityHeaders(options: SecurityHeadersOptions = {}): Plugin {
  return {
    name: "uptime:security-headers",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: `/*\n${securityHeaderLines(options)
          .map((line) => `  ${line}`)
          .join("\n")}\n${(options.json ?? [])
          .map((path) => `${path}\n  Content-Type: application/json\n`)
          .join("")}`,
      });
    },
  };
}
