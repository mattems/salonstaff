# Status

_Last updated: 2026-11-28_

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
- The app on your own iPhone against the local API: `bun run ios:device` (a development build, as in the
  other apps, with `expo-dev-client`; signed with Studio 372 Pty Ltd's team, N2TR84P2TD, in app.json) or `bun run phone`
  (Expo Go). Both open the API and site to the Wi-Fi on :8891/:8892 while they run and point the app at
  them (apps/mobile/README.md). Running on Matt's iPhone (the App ID and its profile were made in Xcode
  once; see the README if a new phone hits the provisioning error).
- The app's tab bar is iOS's own (`NativeTabs`): Jobs, Saved, Applications, Inbox (now a tab, with the unread
  count as its badge, refreshed on return to the app and when a push arrives) and Profile. Each tab has its
  own stack for its title bar. A new Settings screen (Profile → Settings): notification preferences per topic,
  push and email (D-15, migration 0009), light/dark/system (kept on the phone), the version, and in
  development builds the API, website, build kind and device, shareable.
- A new name after the ID check expires it (D-16): verification status `expired`; the website and app warn
  before saving and the verification pages explain it.
- Conversations (D-17, D-19; migrations 0010, 0011): one conversation per salon and job seeker
  (`conversations`, `conversation_messages`), however it started. The salon's team writes from an application
  (with quick replies), from the person's profile ("Message {name}", when they take messages) or from its new
  Messages page (`/employer/{salon}/messages?with={usr}`, unread count on its tab); each message can say
  which application it's about. "Show number" also puts a line in the conversation. The job seeker replies
  once the salon has written, in one Inbox (`/inbox?c={cnv}`, and the app's Inbox tab). Conversations are
  read and written only there and on the salon's Messages page; applications link to them.
  Push and email under "Messages from salons"; nobody's email is shown, and emailed profile messages with
  reply-to are gone. Limits only while cold (not applied, not replied): 25 new people a day per salon, one
  message a day to each. A salon-wide Applicants page,
  and the same on each job's page: statuses with their counts down the left (a row on a phone), job, unread replies, verified checks, open to work,
  experience, name search, sort (`GET /v1/employer/salons/{salonId}/applicants`, up to 200).
- Live conversations (D-18): while a conversation is open on the website or in the app, new messages and
  "Jess is typing…" arrive at once over a WebSocket held by a Durable Object per salon and job seeker
  (`ConversationRoom`, `/v1/me/conversations/{id}/live`, `/v1/employer/salons/{salonId}/candidates/{userId}/live`). Whoever has it open isn't also pushed or emailed.
  `bun run phone` / `ios:device` forward the socket too (restart them to pick that up). On the website the
  conversation is shadcn's chat parts (`message`, `bubble`, `message-scroller` in packages/ui): a fixed-height
  window that keeps to the newest message, with a jump-down button when reading further up. The
  website's router restores scroll positions only when you change page, not when a page reloads its
  data (`src/router.tsx`), which used to pull the conversation back up after each new message. In the
  app, reading further up keeps your place when a message arrives, and a button over the reply box says
  "2 new messages" (or just points down) and takes you to the newest.
- The app's Inbox badge stays current without a socket: a push re-checks it, as do coming back to the
  app and switching tabs; when message pushes don't reach the phone (turned off, not allowed, or the API
  can't send them, as locally without an APNs key: `PUT /v1/me/push-device` says `delivered`), it also
  re-checks every 15 seconds while the app is open (`hooks/use-fresh-inbox.ts`). Locally there is no APNs
  key, so that is how the badge updates on a phone or the simulator; with pushes it updates at once.
- Admin: staff can edit a salon's details (name, place, contact details) from its page (`PATCH /admin/v1/salons/{id}`,
  `salons:moderate`); a new place redirects, as when an owner changes it.
- One salon area for all your salons (D-20):
  - **API:** `GET /v1/employer/jobs`, `/v1/employer/applicants` and `/v1/employer/conversations` across
    every salon you're on (optional `salonId`), from the new `employerDesk` scope. Applicants and
    conversations carry `salon {id, name}`. `GET /v1/employer/salons` has each salon's `unreadMessages`.
  - **Website:** the `/employer` area is a shadcn sidebar layout (`components/salon-shell.tsx`), without the
    site's header and footer. Hiring: Overview, Jobs, Applicants, Messages. Your salons: each with Overview,
    Team, Billing and Salon details. Your account at the bottom.
  - **Posting a job:** "Post a job" (`/employer/jobs/new`) starts by choosing the salon.
  - **Old links:** `/employer/{salon}/applicants`, `/messages` and `/jobs/new` redirect to the new pages.
    The reply email now links to `/employer/messages?salon=…&with=…`.
- The app's salon side (D-20): someone on a salon's team starts on it. Switching is from Account (salon side)
  or Profile (job seeker's), kept on the phone (`lib/mode.tsx`).
  - **Tabs:** Jobs (live, drafts, ended), Applicants (by status, and by salon when there are several),
    Messages (unread badge) and Account.
  - **Screens:** a job (close or relist, its applicants), an application (status, message, show number), a
    full profile, and the conversation (live, with quick replies).
  - **Website only:** posting and editing jobs, and a salon's details, team and billing; the app links there.
  - **Notices:** a salon's notices open the job or conversation and switch to the salon side.
  - **Fixes:** salon owners are no longer sent to set up a job seeker profile when they sign in to the app.
  - **Local:** a "Demo salon owner" sign-in, and the demo seed now makes owner1 an owner of owner2's salon
    too (two salons to try).
- The app's portfolio photo viewer (a profile's photos, on both sides) works like a phone's own: swipe
  sideways between photos, swipe down to close (the photo follows the finger as the background fades),
  pinch or double tap to zoom (double tap zooms in around the spot tapped, and out again; then drag
  around the photo), and tap to show or hide the counter and caption
  (`components/image-viewer.tsx`, with Gesture Handler 3 and Reanimated, already in the build).
- Notification settings for salon teams (D-20): two topics, "New applicants" and "Replies from job
  seekers" (`applicants`, `replies` in `NOTIFICATION_TOPICS`, each with a `side`). The new-applicant and
  reply notices now go under them. The app's Settings shows the topics of the side it's on. Older apps
  that send only the job seeker's topics leave the salon ones as they were. No website settings page yet,
  on either side.
- Face ID to open the app (D-21): with it on, the app asks for Face ID, Touch ID or a fingerprint (or the
  phone's passcode) when it opens with a saved session and after five minutes away
  (`lib/biometric-lock.tsx`, `expo-local-authentication`). It's offered once after a code sign-in and is
  a switch in Settings. "Sign in another way" signs out. Signing out forgets it. A new native module:
  rebuild the app (`bun run ios:device` on a phone, `npx expo run:ios` for the simulator).
- Adding a salon (D-22, proposed; migrations 0014, 0015):
  - **Wizard:** "Add a salon" (`/employer/onboarding`) asks for the name and postcode, offers listed salons
    with a name like it nearby (`GET /v1/salons/matches`, `nameMatchScore`), then claims the one picked or
    takes a new salon's details (an ABN that's already listed offers that listing's claim), then a cover
    photo and logo. The listing's own claim page uses the same claim steps.
  - **Claims by code:** the ABN is optional when a code proves it (checked if given; still needed
    for a staff check; migration 0015). A six-digit code to the listing's own email (the link still works) or by SMS to
    its own mobile (`GET /v1/salons/{id}/claim-options`, `POST /v1/claims/{id}/code`); 5 wrong codes, a
    new one every 5 minutes at most, each start counts towards the day's 5; the claimant ticks that they
    run it. A landline, or a mobile if asked, gets a call that reads out the code (Twilio Voice, 8am to 8pm the salon's time;
    `TWILIO_VOICE_FROM`); locally the call's words go to Mailpit as `call+<number>@local.test`. The
    admin claims queue shows the proof used.
  - **Photos:** a cover photo (`salons.hero_key`) and logo (`/v1/employer/salons/{id}/hero`, `/logo`,
    owners), on the wizard's last step and the Salon details page.
  - **Salon page:** cover photo with the logo over its edge, place and badges, website and Instagram
    buttons, about, jobs, and a contact card with icons. Directory cards show the logo.
  - Tried locally in the browser: finding 101 Barbers, claiming it by SMS code (a wrong code, then the
    right one), uploading both photos, the public page on desktop and phone widths, and starting a
    claim by call on a landline listing (106 Hair Design). Calls not yet tried through Twilio.
- Twilio Verify (D-23; migration 0016): when `TWILIO_VERIFY_SERVICE_SID` is set, sign-in and
  mobile-change SMS codes and claim codes (SMS to a mobile, a call to a landline) are sent and checked
  by Verify; codes last 10 minutes. Locally, real texts and calls only go to `TWILIO_LOCAL_ALLOW`
  (yours); everything else still goes to Mailpit. Staff changing a listing's phone now confirm with a
  passkey (`salon.change_phone`), as for its email. Setup in docs/runbooks/twilio.md. Not yet tried
  against Twilio (needs Matt's subaccount and service).
- Secret scanning: `.gitleaks.toml` allows the made-up test secret in `apps/api/test/hardening.test.ts`
  (gitleaks flagged the committed line, so `bun run ci` stopped at its first step).
- No Dependabot: `.github/dependabot.yml` is gone (it only sent weekly bumps for the Actions and the
  app's npm packages; its alerts and security updates were already off). Secrets are checked by
  gitleaks in `bun run ci`; dependencies are updated by hand.

### Known issues
- Security audit (2026-11-27): 34 findings in docs/security-audit.md. Most are fixed (its "Where it stands" lists them; migrations 0012 and 0013); what's left needs Matt's decision, a setting in Stripe, Twilio or R2, or is listed there as not done.
- Not yet tried for real: SMS to the old number after a mobile change (Twilio), and the share
  page's preview card on Facebook, LinkedIn or WhatsApp (needs a deploy).
- Not yet tried: a live conversation on a real iPhone through `bun run ios:device`'s forwarder, and a
  deployed one through the website's service binding (both tried locally in the browser and simulator).
- Not yet tried in a browser: the Team page, invite page and employer account page (API tests cover the
  flows). The salon area's Overview, Jobs, Post a job, Applicants and Messages were tried locally with two
  salons, on desktop and phone widths.
- The app's salon side was tried in the simulator (lists, a job, an application, the conversation, switching
  sides, signing out and in). Not yet tried there: changing a status, sending a message, showing a number,
  closing or relisting a job, or opening one from a push.
- Not yet tried for real: connecting Google/Apple from the account page (needs keys; the API side is
  Better Auth's `link-social`).
- Not yet tried for real: Google/Apple sign-in, Twilio SMS, Stripe, Stripe Identity, ABR lookup (all need keys),
  and a deploy.
- Not yet tried on PlanetScale: migration 0003 creates a PL/pgSQL trigger function (plain Postgres; should work).

### Decided, deferred (not built)
- Passkeys (D-21): signing in with Face ID on a new phone or on the website. Needs Better Auth's passkey
  plugin, the domain linked to the app and a native module. Best done once the site is deployed.
- Applicant trust (D-08, docs/applicant-trust.md): Turnstile, application caps, a verified Australian mobile to apply,
  work rights matched per job, My VEVO emails, held applications and salon reports, the ID check becoming optional.
  Deferred until after the initial phase; needs more thought (Matt). Until then applying needs a passed ID check.
- Identity provider for a later DVS check: research and shortlist in docs/idmatch-research.md.

### Proposed (not decided)
- Listing checks (docs/listing-checks.md): a script run on demand that finds closed listings and fills in missing
  phones and emails from salons' own websites, reviewed before anything changes.

### Not done yet
- Drop `salons.owner_id` in a later migration, once deployed code no longer reads it (D-11). Likewise
  `seeker_profiles.phone`, `pay_expectation` and `qualifications` (D-13), and `application_messages`,
  `applications.last_message_at`/`salon_read_at`/`seeker_read_at` and `profile_contacts.message`/`read_at`
  (copied into conversations by migration 0011, D-19).
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
