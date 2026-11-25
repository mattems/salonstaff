/**
 * /sitemap.xml (an index) and its children, /sitemaps/{jobs,salons,landings}.xml, from the
 * API's `GET /v1/site/sitemap`. Answers are cached at the edge for a few minutes.
 */
import { api, unwrap } from "./api";
import { absolute } from "./seo";

export const SITEMAPS = {
  jobs: ["job"],
  salons: ["salon"],
  landings: ["jobs_landing", "salons_landing"],
} as const;
export type SitemapName = keyof typeof SITEMAPS;

const MAX_AGE = 300;

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function edgeCache(): Cache | undefined {
  return (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
}

/** The response for `request`, from the edge cache if it's there, else made and stored. */
export async function cached(request: Request, make: () => Promise<Response>): Promise<Response> {
  const cache = import.meta.env.DEV ? undefined : edgeCache();
  const key = new Request(new URL(request.url).toString(), { method: "GET" });
  const hit = await cache?.match(key);
  if (hit) return hit;
  const response = await make();
  if (cache && response.ok) await cache.put(key, response.clone());
  return response;
}

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${MAX_AGE}`,
    },
  });

async function entries() {
  return unwrap(await api.GET("/v1/site/sitemap")).entries;
}

export async function sitemapIndex(): Promise<Response> {
  const all = await entries();
  const items = (Object.keys(SITEMAPS) as SitemapName[]).map((name) => {
    const kinds: readonly string[] = SITEMAPS[name];
    const dates = all.filter((entry) => kinds.includes(entry.kind)).map((entry) => entry.lastmod);
    const lastmod = dates.sort().at(-1);
    return `  <sitemap><loc>${escapeXml(absolute(`/sitemaps/${name}.xml`))}</loc>${
      lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
    }</sitemap>`;
  });
  return xml(
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`,
  );
}

export async function sitemap(name: SitemapName): Promise<Response> {
  const kinds: readonly string[] = SITEMAPS[name];
  const urls = (await entries())
    .filter((entry) => kinds.includes(entry.kind))
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(absolute(entry.path))}</loc><lastmod>${entry.lastmod}</lastmod></url>`,
    );
  return xml(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
  );
}
