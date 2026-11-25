# Architecture

## Topology (production only, plus local)

| Host | Worker | Notes |
|---|---|---|
| `salonstaff.com.au` | `apps/web` (TanStack Start, SSR) | Forwards `/api/*` to the API over a service binding, so the session cookie lives on this host only |
| `api.salonstaff.com.au` | `apps/api` (Hono) | `/v1/*` for the mobile app (bearer token), Stripe webhooks, `/docs` |
| `admin.salonstaff.com.au` | `apps/admin` (SPA assets + a forwarding Worker) | Behind Cloudflare Access; forwards only `/api/admin/v1/*` to the API |
| `cdn.salonstaff.com.au` | R2 bucket `salonstaff-media` (public) | Profile photos, portfolios, salon logos |

- **Database:** PlanetScale Postgres, reached through **Hyperdrive** (pooling). Drizzle with `pg`, one
  client per request. Workers are placed next to the database (`placement.region`). Locally: Docker
  Postgres 18 on port 54349.
- **Files:** R2. `salonstaff-media` is public (unguessable, immutable names). `salonstaff-private` holds
  only qualification certificates waiting for review; staff read them through the admin API, and they are
  deleted once a decision is made.
- **Email:** Resend (Mailpit locally). **SMS:** Twilio (Mailpit locally, as `sms+<number>@local.test`).
- **Billing:** Stripe Checkout + Billing portal; Stripe Identity for ID checks. Off until set up.
- **Cron:** the API's daily trigger runs housekeeping (purges unreviewed verification evidence after 30 days).

## Sign-in (D-02)

Better Auth, mounted on the API at `/v1/auth/*` (the website reaches it at `/api/v1/auth/*`).
One flow for sign-in and sign-up — an account is made the first time:

- Google, Apple
- a 6-digit code by email (Better Auth `emailOTP`)
- a 6-digit code by SMS (`phoneNumber`; a mobile-only account has a stand-in `…@phone.salonstaff.invalid` email)

The website uses a session cookie; the mobile app sends the session token as `Authorization: Bearer`.
Banned (suspended) people can't start a session and their existing ones stop working.

Staff are not users: Cloudflare Access proves who they are by email, the API checks the Access JWT and
the `staff` table, and dangerous changes need a staff passkey (D-06). Locally a staff picker stands in.

## Data

- Tables: `packages/db/src/schema.ts`. Access only through scopes in `packages/db/src/*` (see conventions).
- IDs are UUIDv7 in the database and prefixed at the API edge (`usr_…`, `sln_…`, `job_…`).
- `audit_log` records every change by people, staff and the system.
- **Verification (D-03):** checks are `identity` (Stripe Identity: document + live selfie), `right_to_work`
  (staff check VEVO from the visa grant number, erased on decision) and `qualification` (certificate reviewed by
  staff). Once decided, only the verification ID (`SSV-XXXX-XXXX`), outcome, date and a minimal result remain.
  Salons see the IDs. **Now:** applying needs a profile and a passed ID check.
- **Applicant trust (D-08, planned, not built):** Turnstile, application caps, a verified Australian mobile to
  apply, work rights matched against the job (salon default, per-job override), My VEVO emails for visa holders,
  and the ID check becoming optional. Deferred until after the initial phase.
- **Listings (D-05):** every new or claimed salon gets 90 free days; the first 200 are founding salons
  (Salon Plan at $69 instead of $99). After that a job needs a listing credit ($49) or the Salon Plan.
  Staff can give credits and extend free periods.
- **Directory and claims (D-04):** staff import salons (CSV); owners claim with a matching ABN plus a link
  sent to the listing's business email, or staff approval.
  The CSVs come from `tools/directory` (D-09): Overture Maps places, ABS suburbs, ABNs from the ABR.
- **Near me (D-10):** jobs and salons have the coordinates of their suburb's centre, set by a database
  trigger; searches filter by distance from the browser's (rounded) location or a postcode.
- **URLs (D-07):** `/jobs/{state}/{suburb}/{title}-{salon}`, `/salons/{state}/{suburb}/{salon}`, landing
  pages by role and place, 301s after renames, sitemap from the database.
