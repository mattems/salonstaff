import { createFileRoute } from "@tanstack/react-router";
import { cached, SITEMAPS, type SitemapName, sitemap } from "@/lib/sitemap";

/** /sitemaps/jobs.xml, /sitemaps/salons.xml, /sitemaps/landings.xml */
export const Route = createFileRoute("/sitemaps/$name")({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        const name = params.name.replace(/\.xml$/, "");
        if (!params.name.endsWith(".xml") || !(name in SITEMAPS)) {
          return new Response("Not found", { status: 404 });
        }
        return cached(request, () => sitemap(name as SitemapName));
      },
    },
  },
});
