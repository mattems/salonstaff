import { createRoute, z } from "@hono/zod-openapi";
import { publicSite } from "@salonstaff/db";
import {
  type AuState,
  type JobRole,
  jobPath,
  jobsLandingPath,
  salonPath,
  salonsLandingPath,
} from "@salonstaff/shared";
import { createRouter } from "../lib/router";
import { json } from "../lib/schemas";

/** What the website needs to describe itself to search engines. */
export const siteRoutes = createRouter();

const SitemapSchema = z
  .object({
    entries: z.array(
      z.object({
        path: z.string(),
        lastmod: z.string(),
        kind: z.enum(["job", "salon", "jobs_landing", "salons_landing"]),
      }),
    ),
  })
  .openapi("Sitemap");

type Kind = "job" | "salon" | "jobs_landing" | "salons_landing";

/** Keeps the newest date for each path. */
class Entries {
  private readonly byPath = new Map<string, { kind: Kind; lastmod: Date }>();
  add(kind: Kind, path: string, lastmod: Date) {
    const seen = this.byPath.get(path);
    if (!seen || seen.lastmod < lastmod) this.byPath.set(path, { kind, lastmod });
  }
  list() {
    return [...this.byPath].map(([path, { kind, lastmod }]) => ({
      path,
      kind,
      lastmod: lastmod.toISOString(),
    }));
  }
}

siteRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/site/sitemap",
    summary: "Everything for the sitemap",
    description:
      "Every live job ad, every visible salon page, and every listing page that has something on it: jobs by role and place (`/jobs/{role}/{state}/{suburb}` and everything above it) and the directory by place. Closed jobs and empty listings are left out.",
    tags: ["Site"],
    responses: { 200: json(SitemapSchema, "Sitemap entries") },
  }),
  async (c) => {
    const data = await publicSite(await c.get("db")()).sitemap();
    const entries = new Entries();
    for (const job of data.jobs) entries.add("job", jobPath(job), job.lastmod);
    for (const salon of data.salons) entries.add("salon", salonPath(salon), salon.lastmod);
    for (const { role, state, suburbSlug, lastmod } of data.jobPlaces) {
      const places: { role?: JobRole; state?: AuState; suburbSlug?: string }[] = [
        {},
        { state },
        { state, suburbSlug },
        { role },
        { role, state },
        { role, state, suburbSlug },
      ];
      for (const place of places) entries.add("jobs_landing", jobsLandingPath(place), lastmod);
    }
    for (const { state, suburbSlug, lastmod } of data.salonPlaces) {
      for (const place of [{}, { state }, { state, suburbSlug }]) {
        entries.add("salons_landing", salonsLandingPath(place), lastmod);
      }
    }
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ entries: entries.list() }, 200);
  },
);
