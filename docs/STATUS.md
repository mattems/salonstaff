# Status

_Last updated: 2026-11-27_

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
  directory + claims, salon teams and invites, billing + Stripe webhook, sitemap data, local mock identity/checkout) and `/admin/v1` (overview,
  checks and claims queues, people, salons, jobs, payments, directory import, staff, passkeys, audit log). 135 tests.
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

- Several salons per account, and salon teams (D-11): owners and managers (`salon_members`), emailed invites
  (7 days), promote/remove/leave (a salon keeps an owner), claims of more listings and of owned listings (the
  owners are emailed), and per-job choice of who hears about applications. API under
  `/v1/employer/salons/{salonId}/…` (the singular `/v1/salon/*` is gone); website `/employer/{salonId}/…`
  with a salon switcher, a Team page and `/invite`; admin shows each salon's team. Migration 0004 copied
  owners into `salon_members`.
- Employers' own account page (`/employer/account`, linked from the header and the salon switcher): change
  their name (`PATCH /v1/me`; a job seeker's name follows their profile), see how they sign in, their salons,
  and delete the account.

- Account security (D-12), on both account pages (`/employer/account`, `/account`): change or add the
  account's email with a code to the new address (the old address is told; `POST /v1/me/email` and
  `/v1/me/email/confirm`), connect and disconnect Google and Apple (`/v1/me/sign-in-methods`), and see
  where you're signed in and sign devices out (`/v1/me/sessions`). All audited. Better Auth's own
  `update-user` (which let anyone set their own role), session and unlink endpoints now 404.

- Job seeker profiles (D-13):
  - `/account` is a list of sections on the left with the chosen one on the right: basics, photo,
    skills, availability and pay, portfolio, experience and education, endorsements, visibility and
    sharing, how salons contact you, verification, sign-in and security. The inbox (`/inbox`) and
    their jobs (`/applications`, applied and saved) are full-width pages of their own.
  - Visibility is public, salons only (the default) or hidden. Seekers can hide from chosen salons.
  - Public profiles get an unguessable share link (`/p/{code}`, noindex, first name and last
    initial, no contact details, work rights or pay). The seeker can get a new code, and there's a
    downloadable post image for Instagram and TikTok, drawn in the browser.
  - Salons contact seekers by message (emailed, reply-to the sender) or by revealing their
    verified mobile, as the seeker chooses. Both are recorded, capped per day, and listed for the
    seeker, who can hide the salon from there.
  - Endorsements: asked for by email, written once through a link, then shown or hidden by the
    seeker. Marked "On Salon Staff" when the referee is on a salon's team.
  - Change or add the mobile with an SMS code (`/v1/me/mobile`, both account pages). Better Auth's
    own `updatePhoneNumber` is refused.
  - Pay is a number and period (`payMin`/`payPeriod`), backfilled from the old text. TikTok handle
    added.
  - Salons can now open any profile that's open to salons (`/v1/employer/salons/{salonId}/candidates/{userId}`),
    not only applicants'.
  - Qualifications are one list (education entries); the Basics box is gone. Each entry is
    verified with its certificate from the Qualifications section or the Verification page, and
    shows a "Verified" tick on the profile once staff pass it.
  - Profiles show a tick by the name once ID and right to work are verified, and a side panel of
    what was checked (right to work's basis and how, each qualification). Portfolio photos open
    in a lightbox.
  - An inbox of salons' messages and number views, with an unread count on a bell in the header.
  - Migrations 0005, 0006 and 0007.
- Mobile app (`apps/mobile`, still not a workspace) moved onto the current API: types generated from the
  OpenAPI description (`bun run api:types` writes `apps/mobile/src/lib/api/schema.d.ts`), Better Auth
  sign-in by email or SMS code with the session as a bearer token, Google/Apple only when the build is
  configured, and a local "Demo job seeker" button (`/v1/auth/dev-login` now also returns the token).
  Jobs, job ads by path with the API's `blocker`, apply, saved, applications and checks, where each
  qualification is an education entry with its own certificate. The Profile tab has the website's
  account sections: basics (TikTok added; the old mobile and free-text qualifications fields gone),
  photo, skills, availability and pay, portfolio, experience and qualifications, endorsements,
  visibility and sharing (the share link through the phone's share sheet; no post image), how salons
  contact you, verification, and sign-in and security (email and mobile by code, Google/Apple, devices).
  An inbox of salons' messages and number views, with the unread count on the Profile tab.
- Mobile app ready for TestFlight, built and uploaded on Matt's Mac (no EAS):
  `apps/mobile/scripts/testflight.sh` (`npm run testflight`) prebuilds, archives with Xcode, refuses a
  bundle that doesn't point at the production API, and uploads; the build number is the UTC time.
  docs/runbooks/testflight.md. Production now sets `APPLE_BUNDLE_ID` for the app's Apple tokens. Not signed
  or uploaded yet: it needs Matt's Apple account in Xcode and the first deploy.
- Push notifications (D-15): the API sends the notices it emails as pushes too, straight to Apple (APNs key
  and JWT, no Expo push service); locally to Mailpit as `push+<userId>@local.test`. `push_devices` (migration
  0008) has one row per signed-in app session (`PUT`/`DELETE /v1/me/push-device`), deleted with the session.
  `Contact` now carries `userId`. Background notices finish before the request's database connection
  closes. The app asks once there's a profile and opens the matching screen when a push is tapped.
  docs/runbooks/push-notifications.md. Not tried against Apple yet: needs Matt's APNs key.
- Admin: staff can edit a salon's details (name, place, contact details) from its page (`PATCH /admin/v1/salons/{id}`,
  `salons:moderate`); a new place redirects, as when an owner changes it.

### Known issues
- Not yet tried for real: SMS to the old number after a mobile change (Twilio), and the share
  page's preview card on Facebook, LinkedIn or WhatsApp (needs a deploy).
- Not yet tried in a browser: the multi-salon employer pages, switcher, Team page, invite page and
  employer account page (API tests cover the flows).
- Not yet tried for real: connecting Google/Apple from the account page (needs keys; the API side is
  Better Auth's `link-social`).
- Not yet tried for real: Google/Apple sign-in, Twilio SMS, Stripe, Stripe Identity, ABR lookup (all need keys),
  and a deploy.
- Not yet tried on PlanetScale: migration 0003 creates a PL/pgSQL trigger function (plain Postgres; should work).

### Decided, deferred (not built)
- Applicant trust (D-08, docs/applicant-trust.md): Turnstile, application caps, a verified Australian mobile to apply,
  work rights matched per job, My VEVO emails, held applications and salon reports, the ID check becoming optional.
  Deferred until after the initial phase; needs more thought (Matt). Until then applying needs a passed ID check.
- Identity provider for a later DVS check: research and shortlist in docs/idmatch-research.md.

### Proposed (not decided)
- Listing checks (docs/listing-checks.md): a script run on demand that finds closed listings and fills in missing
  phones and emails from salons' own websites, reviewed before anything changes.

### Not done yet
- Drop `salons.owner_id` in a later migration, once deployed code no longer reads it (D-11). Likewise
  `seeker_profiles.phone`, `pay_expectation` and `qualifications` (D-13).
- Salons searching and browsing job seeker profiles (by role, place, pay, availability): next, maybe a
  Salon Plan feature (D-13). Reporting spam messages to staff.
- Nothing runs on GitHub while developing locally: CI only runs when a deploy calls it (none yet). Run
  `bun run ci` before merging. To check pull requests on GitHub again, add `pull_request:` to `.github/workflows/ci.yml`.
- Directory pages don't yet credit the directory's data sources (Overture, ABS, ABR); needed before importing
  the built CSVs in production (tools/directory/README.md).
- No Cloudflare account, PlanetScale database or deploy yet (docs/runbooks/first-deploy.md).
- Google, Apple, APNs, Twilio, Stripe and Resend keys (Matt sets them).
- Mobile app: not tried on Android or a physical device; Google/Apple sign-in and connecting them not tried
  (needs keys and a development build). No post image for Instagram/TikTok (the website draws it).
