# D-01 Stack: Cloudflare + PlanetScale, kaybee's foundations

**Status:** Accepted (2026-11-25)

**Decision.** Run everything on Cloudflare Workers with PlanetScale Postgres via Hyperdrive, and build on the
foundations of `~/www/kaybee` (Bun, Turbo, Hono + zod-openapi, Drizzle with `pg`, Better Auth, React + Vite +
shadcn admin portal, Docker Postgres + Mailpit, springboard), trimmed for a simpler product. The website is
TanStack Start (server-rendered on a Worker) so job and salon pages are indexable. One production environment.

**Why.** Matt requires Cloudflare infrastructure and a separate admin domain; kaybee already solves both.
The previous Next.js version used an embedded database and local disk, which don't run on Workers.

**Left out of kaybee:** workspaces, SSO, invite codes, two-factor, API tokens, the KB/Assistant/site apps,
the jobs Worker and queues, analytics, AI, translation, plan versioning.
