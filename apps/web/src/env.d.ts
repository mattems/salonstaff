/// <reference types="vite/client" />

/** The Worker's bindings (wrangler.jsonc). Only src/lib/upstream.ts reads them. */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

/** Build constants from @salonstaff/config/build-info. */
declare const __APP_ENVIRONMENT__: string | null;
declare const __APP_VERSION__: string;
