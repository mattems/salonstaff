# Conventions

Short rules per area. `CLAUDE.md` has the ones that apply everywhere.

## API (`apps/api`)
- Routes: `router.openapi(createRoute({...}), handler)` on `createRouter()`; zod schemas with `.openapi("Name")`;
  admin-only schemas are named `Admin…` so they stay out of the public reference. A named schema that may be
  null is `orNull(Schema)`, never `Schema.nullable()` (that marks the shared component nullable everywhere).
- `PATCH` bodies: left out keeps a value; for optional text, blank or `null` clears it.
- Errors: `throw new ApiError(code, { detail, hint })`, always with a hint. Add new codes to `packages/shared/src/errors.ts`.
- IDs: `encodeId` on the way out, `decodeId` on the way in (null → `not_found`).
- Who's calling: `await c.get("session")()`. Wrong role → `forbidden`; nobody → `unauthenticated`.
- Salon routes are `/v1/employer/salons/{salonId}/…` and start with `requireSalon(c, salonId, "manager" | "owner")`:
  not on the team → `not_found`, a manager doing an owner's job → `forbidden` (D-11).
- Every change: `recordAudit` in the same transaction. Honour `c.get("dryRun")`. `Idempotency-Key` works on any `POST`.
- Notifications never fail a request: log and carry on. People without an email get an SMS.
- After changing a route: `bun run api:types`.

## Data (`packages/db`)
- No table imports outside `packages/db`. Scopes: `publicSite`, `publicProfiles` (share links and
  referees' links), `seeker(db, userId)`, `signIns(db, userId)`, `salonScope(db, salonId)`,
  `salonTeam(db, salonId)`, `invites`, `claims`, `checks`, `backOffice` (behind `requireStaff` only),
  `housekeeping` (the cron only).
- Who manages a salon is `salon_members` (D-11); `salons.owner_id` is deprecated, never read or written.
  Claimed means `isClaimed`/`claimed()` (made by its owner, or `claimed_at` set).
- Migrations: `bun db:generate -- --name <name>`; forward only, expand then contract.
- `latitude`/`longitude` on salons and jobs are set by the database (trigger `set_coordinates`, D-10) from
  `localities`/`postcodes`; never write them from code.

## Auth (`packages/auth`)
- Only this package imports Better Auth. No passwords. Rate limits come from the API's Cloudflare bindings.
- Dev login (`POST /v1/auth/dev-login`) exists only locally.
- Changes to how someone signs in go through audited `/v1/me` routes (D-12). The API answers 404 for Better
  Auth's own versions (`update-user`, `change-email`, session listing and revoking, `unlink-account`);
  add any new one to `HIDDEN` in `apps/api/src/routes/auth.ts`.

## Admin portal (`apps/admin`, `/admin/v1/*`)
- Every route starts with `requireStaff(c, permission)`; permissions are in `packages/shared/src/staff.ts`.
- Dangerous changes (`STAFF_CONFIRMED_ACTIONS`) need `requireConfirmation` (a staff passkey). Skippable only locally.
- Basic shadcn only. Never edit generated files in `packages/ui/src/components`.

## Website (`apps/web`)
- No design yet: plain shadcn, default theme. Matt designs it later.
- Public pages are server-rendered with canonical tags, titles, descriptions and JSON-LD (D-07).
- Links to public pages come from `packages/shared/src/urls.ts`.

## Job seeker profiles (D-13)
- Who may see or contact a profile is `salonAccessTo` in `packages/shared/src/rules.ts`; contact caps are
  `CONTACT_LIMITS`. Salons get `contact: { message, phone }`, never an address or number in a profile:
  messages go through us (reply-to the sender) and the number is revealed by request, both recorded.
- Share pages and anything they return leave out the surname, postcode, work rights, pay and contact details.
- The number salons see is the account's verified mobile. `seeker_profiles.phone`, `pay_expectation`
  and `qualifications` are deprecated: never read or write them.
- Qualifications are `seeker_education` rows; a qualification check names its entry (`education_id`).

## Verification (D-03)
- Never store ID images or document numbers after a decision. Certificates live in the private bucket only until reviewed.

## Files
- Uploads are judged by their bytes (`storeUpload`), get unguessable names, and are never overwritten.

## Tests
- Real Postgres, parallel, shared database: create your own rows with unique values; never change others'.
