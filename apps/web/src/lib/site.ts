/**
 * Where the website lives and where its pictures come from. Plain values, so vite.config.ts can
 * read them too.
 */
export const SITE_ORIGIN = {
  production: "https://salonstaff.com.au",
  local: "http://localhost:5300",
} as const;

/** Uploaded pictures (profile photos, portfolios, logos): R2 deployed, the API locally. */
export const MEDIA_ORIGIN = {
  production: "https://cdn.salonstaff.com.au",
  local: "http://localhost:8890",
} as const;

/** Where the API answers locally when the service binding isn't there (`bunx wrangler dev`). */
export const LOCAL_API_ORIGIN = "http://localhost:8890";
