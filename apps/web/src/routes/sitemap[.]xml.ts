import { createFileRoute } from "@tanstack/react-router";
import { cached, sitemapIndex } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: { GET: ({ request }) => cached(request, sitemapIndex) },
  },
});
