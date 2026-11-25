/**
 * Everything a page tells search engines (D-07): title, description, canonical address, Open
 * Graph, robots, and JSON-LD. Pages call `seo()` from their route's `head`.
 */
import { BRAND } from "@salonstaff/shared";
import { SITE_ORIGIN } from "./site";

export const siteOrigin = (): string =>
  import.meta.env.DEV ? SITE_ORIGIN.local : SITE_ORIGIN.production;

export const absolute = (path: string) => new URL(path, siteOrigin()).toString();

type JsonLd = Record<string, unknown>;

export interface SeoInput {
  title: string;
  description?: string | undefined;
  /** The canonical path, with `?page=` when it's not the first page. Left out for private pages. */
  path?: string | undefined;
  noindex?: boolean | undefined;
  ogType?: "website" | "article" | undefined;
  image?: string | null | undefined;
  jsonLd?: (JsonLd | null | undefined)[] | undefined;
}

/** JSON inside a <script> tag must not be able to close it. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export function seo(input: SeoInput) {
  const title = input.title.includes(BRAND.name) ? input.title : `${input.title} · ${BRAND.name}`;
  const meta: Record<string, string>[] = [
    { title },
    { property: "og:title", content: input.title },
    { property: "og:site_name", content: BRAND.name },
    { property: "og:type", content: input.ogType ?? "website" },
    { property: "og:locale", content: "en_AU" },
    { name: "twitter:card", content: "summary" },
  ];
  if (input.description) {
    meta.push(
      { name: "description", content: input.description },
      { property: "og:description", content: input.description },
    );
  }
  if (input.path) meta.push({ property: "og:url", content: absolute(input.path) });
  if (input.image) meta.push({ property: "og:image", content: input.image });
  if (input.noindex) meta.push({ name: "robots", content: "noindex, follow" });
  const links = input.path ? [{ rel: "canonical", href: absolute(input.path) }] : [];
  const scripts = (input.jsonLd ?? [])
    .filter((item): item is JsonLd => Boolean(item))
    .map((item) => ({ type: "application/ld+json", children: scriptJson(item) }));
  return { meta, links, scripts };
}

/** A page only the signed-in person sees: a title, and kept out of search results. */
export const privatePage = (title: string) => seo({ title, noindex: true });

export const withPage = (path: string, page: number) => (page > 1 ? `${path}?page=${page}` : path);

export function breadcrumbList(crumbs: { name: string; path: string }[]): JsonLd | null {
  if (crumbs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

export function itemList(paths: string[], offset = 0): JsonLd | null {
  if (paths.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: paths.map((path, index) => ({
      "@type": "ListItem",
      position: offset + index + 1,
      url: absolute(path),
    })),
  };
}
