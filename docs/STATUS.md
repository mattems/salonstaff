# Status

_Last updated: 2026-11-25_

## Where things stand

Rebuilding on Cloudflare (Workers + PlanetScale) with the foundations from kaybee (decision D-01).
The earlier Next.js version was replaced; its behaviour is being carried over.

### Built
- Monorepo: Bun, Turbo, Biome, TypeScript 7; Docker Postgres + Mailpit; springboard (:4100); `bun run setup`/`dev`/`ci`/`deploy`.
- `packages/shared`: constants, zod schemas, IDs, errors, staff roles, business rules and URL rules (with tests).
- `packages/db`: schema + first migration; scopes `publicSite`, `seeker`, `salonsFor`/`salonScope`, `claims`, `checks`,
  `billing`, `backOffice`, `staffOffice`, `housekeeping`; idempotent demo seed (`bun db:seed`).
- `packages/auth`: Better Auth with Google, Apple, email code, SMS code, bearer. Banned people can't sign in.
- `packages/email`: Resend/Mailpit sender, sign-in code and notice templates.
- `apps/api`: `/v1` (account and profile, checks, jobs + apply/save, salon onboarding, jobs, applicants, candidates,
  directory + claims, billing + Stripe webhook, sitemap data, local mock identity/checkout) and `/admin/v1` (overview,
  checks and claims queues, people, salons, jobs, payments, directory import, staff, passkeys, audit log). 104 tests.
- `apps/admin`: the admin portal from kaybee, trimmed, with all Salon Staff pages (basic shadcn).
- `apps/web`: the website (TanStack Start on a Worker, basic shadcn, no design yet): SEO job/salon/landing pages with
  canonical tags, JSON-LD, 301s and `/sitemap.xml`; sign-in (Google, Apple, email code, mobile code, local dev login);
  job seeker account, profile, verification, applications; salon onboarding, jobs, applicants, candidates, billing;
  directory and claims. `/api/*` forwards to the API (service binding deployed, localhost in dev).
- `tools/directory` (D-09): a standalone script that builds the directory import CSVs from Overture Maps places,
  ABS suburbs and the ABN Bulk Extract. First run (Overture 2026-11-18.0): 44,283 salons ready (24,037 with an
  email, 11,497 with an ABN), 1,626 to review by hand. `salons-01.csv` imported locally only. Imported ABNs
  aren't queued for staff checks; a claim checks them.

- Near-me search (D-10): jobs and the salon directory within 5–100km of the browser's location or a postcode,
  nearest first, with distances; "Hiring now" on the directory. Places are at their suburb's centre (ABS),
  set by a database trigger; `localities`/`postcodes` loaded by migration 0002.

- Admin: staff can edit a salon's details (name, place, contact details) from its page (`PATCH /admin/v1/salons/{id}`,
  `salons:moderate`); a new place redirects, as when an owner changes it.

### Known issues
- Not yet tried for real: Google/Apple sign-in, Twilio SMS, Stripe, Stripe Identity, ABR lookup (all need keys),
  and a deploy.
- Not yet tried on PlanetScale: migration 0003 creates a PL/pgSQL trigger function (plain Postgres; should work).

### Decided, deferred (not built)
- Applicant trust (D-08, docs/applicant-trust.md): Turnstile, application caps, a verified Australian mobile to apply,
  work rights matched per job, My VEVO emails, held applications and salon reports, the ID check becoming optional.
  Deferred until after the initial phase; needs more thought (Matt). Until then applying needs a passed ID check.
- Identity provider for a later DVS check: research and shortlist in docs/idmatch-research.md.

### Not done yet
- Directory pages don't yet credit the directory's data sources (Overture, ABS, ABR); needed before importing
  the built CSVs in production (tools/directory/README.md).
- No Cloudflare account, PlanetScale database or deploy yet (docs/runbooks/first-deploy.md).
- Google, Apple, Twilio, Stripe and Resend keys (Matt sets them).
- Mobile app (`apps/mobile`) parked; it needs updating to the new API and bearer auth.
