import { createFileRoute } from "@tanstack/react-router";
import { absolute } from "@/lib/seo";

/** Private and transactional pages stay out of search engines; everything public is in. */
const DISALLOW = ["/account", "/employer", "/sign-in", "/claim", "/api", "/dev"];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            "User-agent: *",
            ...DISALLOW.map((path) => `Disallow: ${path}`),
            "",
            `Sitemap: ${absolute("/sitemap.xml")}`,
            "",
          ].join("\n"),
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          },
        ),
    },
  },
});
