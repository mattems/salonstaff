# Security audit: findings to fix

_Audited 2026-11-27 on branch `one-conversation` (commit bb1db34). Read-only: nothing was changed or run against a live system._

How to use this: each finding has an ID, where it is, what goes wrong, and the fix. Work top down.
Every fix should come with a test that fails before it. House rules still apply (scopes in
`packages/db`, pure rules in `packages/shared`, `recordAudit` in the same transaction, honour `dryRun`).

**Checked** = the lines were read and the path traced by the main audit pass.
**Reported** = found by a delegated reviewer who traced it; re-read the code before fixing.
Line numbers are from the audited commit and will drift.

No secrets were found in tracked files or git history. No SQL injection was found (everything is
parameterised through Drizzle; no `sql.raw`). Every `/admin/v1` route calls `requireStaff` first.

## Where it stands (2026-11-27, not yet committed or deployed)

Fixed in code, with lint, typecheck and all tests passing. Migrations 0012 (`code_requests`) and
0013 (`launch_terms`, a message index) go with it. The sections below are the original findings,
kept for reference.

### Fixed

- **S-01:** a dry run of the number look checks access and returns an empty `phone`.
- **S-02:** starting or finishing a passkey registration refuses `dry_run`.
- **S-03:** an active ABN is verified only when every word of the salon's name is in one of the ABN's registered names (it may be shorter, not add to it), or the person already owns a verified salon with it (`salonAbnStatus`); otherwise "ABNs to check". Renaming re-checks. 5 salons per account. Number looks and cold messages are also counted per person.
- **S-04:** `/v1/auth/*` is an allowlist; only sign-in codes are sent; SMS only to `+614`. Codes to one email or mobile: 5 an hour and 15 a day from one caller, 20 an hour and 60 a day from everyone together (so a stranger can't use up someone's allowance).
- **S-05:** launch terms are given once per *verified* ABN (`launch_terms`; an unverified ABN doesn't stand for the business, so it can't use up the real owner's free period) and a re-claimed listing keeps its free period; the founding count is taken under a lock.
- **S-06:** 20 invites a day per salon, 5 claims a day per account, 60 messages an hour per person, 5 notice texts an hour and 15 a day per mobile. Subjects and headings of every notice are one line with web addresses removed (`plainLine`), as are the names in claim and invite emails.
- **S-07:** checkout is fulfilled only when paid; the async succeeded and failed events are handled.
- **S-08:** deleting an account, deleting a salon or handing a listing back cancels its Stripe subscription; an unclaimed listing keeps no credits, plan or Stripe customer.
- **S-09:** JPEG, PNG and WebP photos are stored without metadata (a JPEG keeps its orientation). See "Still open" for HEIC and existing photos.
- **S-10:** invite, endorsement and share-link tokens are masked in logs and in the idempotency table.
- **S-11:** each message re-checks who may have the conversation open and closes anyone else's socket; 5 open views per person.
- **S-12 (in part):** changing the email or mobile signs out every other device.
- **S-13 (in part):** staff can't approve a claim from their own account.
- **S-14:** Docker ports bind to 127.0.0.1; the phone forwarder refuses `/admin` and `/v1/dev`.
- **S-15 (in part):** 3 identity checks a day per person; cancelled Stripe Identity sessions are redacted.
- **S-16:** 9MB body limit before anything is parsed; the upload limiter runs before a dry run; HEIC needs a HEIF brand.
- **S-17:** no idempotency replay under `/admin/`.
- **S-18:** the runbook says removing the staff record is the kill switch.
- **S-20:** viewing a certificate is audited and served sandboxed.
- **S-21:** salon websites must be http(s) addresses (`webAddress`), from owners, staff and the import.
- **S-22, S-23, S-24:** `safeNext` rejects backslashes and control characters; the website forwards only `/api/v1/*` and drops staff and forwarding headers; `page` inside `path` is validated (jobs too).
- **S-25, S-26:** links from outside the app can't open the apply or code screens; a push link can only open a page on our site.
- **S-29 (in part):** the API's local wrangler settings have `workers_dev` and `preview_urls` off.
- **S-31:** the cron also drops expired codes, sessions and invites, and logs `housekeeping_failed`.
- **S-32:** the docs page fails rather than serve its script unpinned.
- **Near me:** `Permissions-Policy` now allows `geolocation=(self)`.

### Still open

Needs a decision from Matt:
- **S-03:** may a salon whose ABN isn't verified yet post jobs or contact people who haven't applied? Today it can.
- **S-12:** require a code to the *current* email or mobile before changing sign-in details or deleting the account (changes the account screens on the website and app).
- **S-13:** a claim on a listing that already has owners still makes a co-owner by email link alone; passkey confirmation for approving claims, detaching a team and changing a listing's email needs portal screens.
- **S-15:** an ID check passes when the ID's name doesn't match the profile.
- **S-19:** binding a passkey confirmation to the role in the request needs the portal to change what it asks to confirm.
- **S-34:** the audit log keeps a deleted person's name and email.
- The "Design questions" below.

Needs doing outside the code:
- **S-04:** a Twilio geo permission and spend cap.
- **S-07:** check which payment methods are on in the Stripe dashboard (cards only is safest).
- **S-09:** HEIC photos are stored as uploaded (their metadata can't be cut out simply), and photos uploaded before this change still carry theirs. Either stop accepting HEIC, serve through Cloudflare image transformations with `metadata=none`, or re-process the bucket.
- **S-15:** an R2 lifecycle rule on the private bucket (about 35 days) as a backstop for orphaned certificates.

Done in the last pass (was "not done"):
- **S-04:** a test lists every route the sign-in library registers and checks all but the allowlist are 404, so an upgrade that adds one fails it.
- **S-08:** deleting your own account cancels the plan first and deletes nothing if Stripe can't be reached. Staff deletes and detaches still cancel afterwards and log `subscription_cancel_failed` on failure.
- **S-09:** HEIC metadata is blanked in place. The daily job rewrites up to 200 already-stored photos a run without their metadata until none are left (`photos_cleaned` in its log line).
- **S-13, S-19:** approving a claim, detaching a team and changing a listing's email need a passkey (`claim.approve`, `salon.unclaim`, `salon.change_email`); adding staff and changing a role confirm the role too. The portal asks for it.
- **S-27:** each Apple or Google ID token from the app is accepted once, so a captured one can't be replayed. No nonce and no app change needed.
- **S-28:** traced: providers trusted by name were linked to an existing account even when the provider hadn't verified the email. Google and Apple are no longer trusted by name, so linking needs a verified email.
- **S-29:** `migrate.ts` and `staff.ts` refuse a database that isn't on this machine without `ALLOW_REMOTE_DATABASE=1`; `bun run deploy` deploys only a clean, pushed `main` after the tests (`--any-tree`, `--skip-tests` to override).
- **S-30 (in part):** stale gitleaks allowlist entries removed. Dependabot was added for the mobile app's npm packages, then turned off at Matt's request (2026-11-28): gitleaks runs locally in `bun run ci` and dependencies are updated by hand.
- **S-33:** subscription events fetch the current state from Stripe; starting a plan checkout closes any unfinished one.
- **Tests added:** the caps on salons and invites, one free period per ABN, links kept out of email subjects, and the unpaid-checkout path.

Review and browser pass (2026-11-28):
- An independent review of the whole change found 10 problems in the fixes themselves; all are fixed. The ones that changed behaviour: a new plan checkout no longer voids one that was just paid; the invite cap can't be reset by cancelling invites; a rename while the business register is down keeps what was verified; account deletion isn't blocked by a plan that already ended.
- Tried in the browser against the local servers: sign-in by email code, the closed sign-in and admin routes through the website, a dry run of the number look (no number), a live message over the socket, a photo upload (location removed, orientation kept, 10MB refused), account deletion, and the portal's passkey prompt on a listing's email change (refused without it).
- After the stored-photo clean-up has run in production, purge the CDN cache: photos are cached for a year, so the old bytes stay there until then.

Left as it is, on purpose:
- **S-11:** a banned person's open conversation closes on the next message rather than at the ban. Nothing readable reaches them in between (only "is typing").
- **S-30:** CI still runs only by hand. `ci.yml` says that's deliberate while the project is developed locally; add `pull_request:` under `on:` to change it. There's no Dependabot (Matt's choice).

Not verified, so try before relying on it:
- **HEIC blanking and the stored-photo clean-up** are tested with files built in the tests, not real phone photos or a real R2 bucket. Upload a HEIC from an iPhone and open it after the first deploy.
- **The portal's passkey prompts:** the listing email change was clicked through locally (with the local skip); approving a claim, detaching a team, adding staff and changing a role were checked at the API only, and none with a real passkey.
- **Plan cancellation and the Stripe fetches** have no test (the tests have no Stripe stand-in), and the website's `/api/v1`-only forwarding has none (the website has no test setup).

---

## High

### S-01 A dry run shows a job seeker's mobile with no record, cap or notice — Checked
- **Where:** `apps/api/src/routes/employer.ts`, `POST /v1/employer/salons/{salonId}/candidates/{userId}/phone` (around line 646).
- **Problem:** With `?dry_run=true` the handler calls `scope.access(userId)` and returns `found.contact.phoneNumber`. It skips everything `viewNumber` does (`packages/db/src/salon.ts:800`): the salon-is-active check, the 50-a-day cap, the `profile_contacts` row, the "number viewed" line in the conversation and the audit entry. Any salon team member can read every reachable seeker's number silently and without limit. It also only checks `access.phone`, not that the salon is active.
- **Fix:** A dry run must never return the number. Return `{ phone: "" }` (or a masked value) after running the same checks, including the cap, without writing. Add a test: dry run returns no digits and a real call still records.
- **Then:** grep every `c.get("dryRun")` branch for ones that return data the real call gates or records. S-02 is the same class of bug.

### S-02 A dry run lets someone add a passkey without confirming with an existing one — Checked
- **Where:** `apps/api/src/lib/staff-confirmation.ts:103` (`if (c.get("dryRun")) return actor;`), `apps/api/src/routes/admin-passkeys.ts:146-172`.
- **Problem:** `POST /admin/v1/passkeys/options?dry_run=true` skips the passkey confirmation, but `startRegistration` still writes a real registration challenge. `POST /admin/v1/passkeys` (no dry run) then enrols the attacker's authenticator. Anyone with a staff member's Cloudflare Access session but not their passkey gets a passkey, and with it every confirmed action (add staff, change roles, bans, deletes). This defeats the second factor in D-06.
- **Fix:** In the options route, refuse dry runs or return before `startRegistration`. Record on the registration challenge that it was confirmed, and make `finishRegistration` require that whenever the staff member already has a passkey. Make `finishRegistration` honour `dryRun`.

### S-03 Anyone can become a "verified" salon and reach job seekers — Checked (badge), Reported (details)
- **Where:** `apps/api/src/routes/employer.ts:128-144` (create) and `:226-233` (ABN change); `apps/api/src/lib/abr.ts:32-36`; `apps/api/src/lib/views.ts:248`; `packages/db/src/salon.ts:271`.
- **Problem:** Any account can create a salon with any business's public ABN and name. `lookupAbn` says `verified` for any active ABN and the salon is shown as `verified: true` immediately. There is no cap on salons per account and no check that the ABN isn't already on another salon. A fake salon then:
  - posts jobs free for 90 days and collects applicants' full profiles and verified mobiles;
  - opens any profile that's visible to salons (the default) if it has the user ID, e.g. from a share link;
  - gets its own daily contact caps (25 cold messages, 50 number views), so more salons means more reach.
- **Fix:**
  - Don't show "verified" on ABR status alone for owner-created salons. Require proof of control (the D-04 claim rules) or staff approval; at least compare the ABR entity/business name with the salon name and queue mismatches for staff.
  - Refuse or queue an ABN already used by another salon.
  - Cap salons per account without staff approval.
  - Count contact caps per account (and per ABN) as well as per salon.
  - Consider holding a new salon's first job, or its access to non-applicant profiles, until it's approved.

### S-04 Sign-in library endpoints nobody uses are reachable, and codes have no per-destination limit — Checked
- **Where:** `apps/api/src/routes/auth.ts:8-31` (`LIMITED`, `HIDDEN`), `packages/auth/src/index.ts:97-124`, `packages/shared/src/constants.ts:128` (`otpRequestsPerHour: 5` is defined and never used).
- **Problem 1, a denylist:** `HIDDEN` blocks nine Better Auth routes; everything else the plugins register is public. Reachable today (better-auth 1.7.28): `/email-otp/request-password-reset`, `/forget-password/email-otp`, `/email-otp/reset-password`, `/email-otp/verify-email`, `/email-otp/check-verification-otp`, `/sign-in/phone-number` (phone + password), `/phone-number/reset-password`, `/list-accounts`, `/account-info`, `/get-access-token`, `/refresh-token`, `/send-verification-email`.
  - None of those are in `LIMITED`, so they only have the general 300-a-minute limit, not the 10-a-minute code limit.
  - Chain: request a "forget-password" code for a victim's email (unlimited sends, each one an email to the victim that the template words as a sign-in code), guess it on `/email-otp/reset-password` (5 tries per code, then ask for a new one), set a password, then sign in with `/sign-in/phone-number` if the victim has a mobile. About 30 times faster to brute-force than the limited sign-in route. `/sign-in/email` is correctly disabled; `/sign-in/phone-number` has no such gate.
  - The same send route is an email bomb against any account holder.
- **Problem 2, no per-destination limit:** the code limit is keyed on IP only (`withinCodeLimit`). Rotating IPs allows unlimited SMS to one number (cost and harassment), unlimited emails to one address, and unlimited guess cycles against one account. The mobile validator `^\+61[2-478]\d{8}$` also accepts landlines.
- **Fix:**
  - Replace `HIDDEN` with an allowlist of exactly the routes the website and app call (`/sign-in/social`, `/callback/*`, `/sign-in/email-otp`, `/email-otp/send-verification-otp` with `type: "sign-in"` only, `/phone-number/send-otp`, `/phone-number/verify`, `/get-session`, `/sign-out`, `/link-social`, plus whatever else a grep of `apps/web` and `apps/mobile` shows). 404 the rest. Add a test that lists the library's routes and fails when a new one isn't classified.
  - Add per-destination limits for sending (use `otpRequestsPerHour`, plus a daily cap) and for failed checks, per email and per number, stored in Postgres or a second rate-limit binding key.
  - Restrict SMS to `+614`. Set a Twilio geo permission and spend cap.
  - Phone codes are stored in plain text by the library (`verifications.value` is `code:attempts`); email codes are hashed. Low risk, note it.

---

## Medium

### S-05 Unlimited free periods and founding places — Checked (code), Reported (scenarios)
- **Where:** `packages/db/src/salon.ts:192-221` (`foundingSoFar`, `launchTerms`), `:271-300`; `packages/db/src/claims.ts:336-351`; `packages/db/src/team.ts:133-141` (`unclaimSalon`).
- **Problem:** Each new salon gets 90 free days and, while under 200, a founding place. One account can loop `POST /v1/employer/salons` and take all 200 founding places, or make a new salon every 90 days and never pay. Delete account → listing unclaimed → re-claim resets `freeUntil`. The founding count isn't locked, so concurrent creates can pass 200. `updateJob` lets a live job be rewritten entirely, so one credit carries many jobs.
- **Fix:** One set of launch terms per ABN, ever (record it against the ABN). Never reset `freeUntil` on a re-claim. Advisory lock around the founding count. Cap salons per account (S-03). Decide whether material edits to a live job are allowed.

### S-06 The system can be made to send attacker-worded email and paid SMS — Checked
- **Team invites:** `apps/api/src/routes/team.ts:70-133`. An owner can email any address; subject and title carry the salon name and account name (120 free characters each). No cap beyond 300 requests a minute. Passes SPF/DKIM for the real domain.
- **Claim emails:** `apps/api/src/routes/directory.ts:304-319`. Any account can trigger an email to every listing's business address, with `contactName` (120 free characters) leading the body. Only a 5-minute throttle per listing and account.
- **SMS fallback:** `apps/api/src/lib/notify.ts` (`notify`). Accounts with only a mobile get every notice by SMS. Messages in a conversation that's no longer "cold" are unlimited, so two colluding accounts (or one annoyed person) can generate SMS at request speed, each one billed.
- **Seeker replies:** each reply emails every team member not looking at the conversation; no rate limit on replies.
- **Fix:** Daily caps per account and per salon on invites and claims, plus a global cap on claim emails. Strip URLs, newlines and control characters from names used in subjects and titles (do it once in `packages/email/src/sender.ts`). Drop `contactName` from the claim email or restrict it to name characters. Coalesce message notices (one per conversation per N minutes) and cap SMS notices per person per day. Rate-limit messages per conversation.

### S-07 Checkout is fulfilled without checking it was paid — Checked (code)
- **Where:** `apps/api/src/routes/billing.ts:266-277`; `apps/api/src/lib/stripe.ts:91-111`.
- **Problem:** `checkout.session.completed` calls `fulfil` without reading `session.payment_status`, and `payment_method_types` isn't pinned. If a delayed method (BECS Direct Debit) is enabled in the Stripe dashboard, the credit or plan is granted while unpaid. The async succeeded/failed events aren't handled.
- **Fix:** Fulfil only when `payment_status` is `paid` or `no_payment_required`; handle `checkout.session.async_payment_succeeded` / `_failed`; or pin `payment_method_types: ["card"]`. Also compare `amount_total` and `metadata.paymentId` with the payment row.

### S-08 Deleting an account leaves the Stripe subscription billing; unclaimed listings keep billing data — Reported
- **Where:** `apps/api/src/routes/me.ts` (`DELETE /v1/me`); `packages/db/src/seeker.ts:847`; `packages/db/src/team.ts:107-141`.
- **Problem:** A last owner's delete removes or unclaims the salon with no Stripe call, so the card keeps being charged with no way to cancel. An unclaimed listing keeps `stripeCustomerId`, `stripeSubscriptionId` and `listingCredits`, so the next claimant inherits the previous owner's plan, credits and billing portal (invoices, card details).
- **Fix:** Cancel the subscription before deleting or unclaiming (or refuse while a plan is active). Clear the Stripe IDs and credits in `unclaimSalon`. The same applies to the admin "detach team" action.

### S-09 Photos are published with their EXIF data, including GPS — Reported
- **Where:** `apps/api/src/lib/storage.ts:52-68`.
- **Problem:** Profile and portfolio photos go to the public bucket byte for byte. A phone photo often carries the coordinates of someone's home.
- **Fix:** Strip metadata or re-encode on upload (Cloudflare Images binding, or a small EXIF stripper for JPEG/HEIC/WebP), or serve only through transformations with `metadata=none`. Run it over existing objects.

### S-10 One-time tokens are written to logs and the idempotency table — Checked
- **Where:** `apps/api/src/middleware/request-context.ts:20` (`loggedPath`), `apps/api/src/middleware/idempotency.ts:47`.
- **Problem:** `loggedPath` masks only `/v1/claims/verify/{token}`. `/v1/invites/{token}`, `/v1/invites/{token}/accept` and `/v1/endorsements/{token}` are logged in full. An invite token makes whoever holds it a manager or owner of the salon (any signed-in account can accept). With an `Idempotency-Key`, the raw path, token included, is stored in `idempotency_keys.scope` for 24 hours. Cloudflare's own invocation logs also record URLs (not verified).
- **Fix:** Move tokens into the POST body, or mask every token path in `loggedPath` and hash the path in the idempotency scope. Consider binding an invite to the invited email (the account's verified email must match) or showing owners who accepted before it takes effect.

### S-11 Live conversation sockets are never re-checked — Checked
- **Where:** `apps/api/src/lib/live.ts`, `apps/api/src/live/conversation-room.ts`.
- **Problem:** Access is checked once, when the socket opens. A team member who is removed, a banned person, or a signed-out session keeps receiving every new message for as long as the socket stays open (they hibernate indefinitely). There's also no cap on sockets per person per room.
- **Fix:** Add a room method to close sockets by user ID and call it when a member is removed or leaves, a user is banned or deleted, and a session is ended. Add a maximum socket lifetime (clients reconnect and are re-checked) and a per-user socket cap.

### S-12 A stolen session can take over the account for good — Checked
- **Where:** `apps/api/src/routes/security.ts` (`/v1/me/email`, `/v1/me/mobile`), `apps/api/src/routes/me.ts` (`DELETE /v1/me`).
- **Problem:** Changing the email or mobile needs only a code sent to the *new* address or number; nothing proves the caller still controls the old one. Other sessions stay signed in after the change. Deleting the account needs nothing extra. Sessions last 60 days.
- **Fix:** Require a fresh code to the current email or mobile (Better Auth has `changeEmail.verifyCurrentEmail`) or a recent sign-in before changing sign-in details or deleting. After a change, end other sessions. Give the old address a link that reverts the change for a few days.

### S-13 Becoming a co-owner of a salon that already has owners — Reported
- **Where:** `packages/db/src/claims.ts:336-385`; `apps/api/src/routes/admin-queues.ts:370-386`; `apps/api/src/routes/admin-salons.ts:608-677`; `packages/shared/src/staff.ts:53-65`.
- **Problem:** Whoever can read the listing's business inbox becomes a full owner of an already-owned salon, can remove the other owners and open the billing portal; existing owners are told afterwards. On the staff side, the `support` role can approve any claim (including their own account's), change the email claim links go to, and detach a salon's team, all without a passkey.
- **Fix:** When a listing already has owners, require an existing owner's approval or staff review. Add `claim.approve`, `salon.unclaim` and salon email changes to `STAFF_CONFIRMED_ACTIONS`; refuse a claim whose claimant email is the staff member's own.

### S-14 Local development is open to the network — Reported
- **Where:** `docker-compose.yml:14,28-29`; `scripts/phone.ts:48-51,129-130`.
- **Problem:** Postgres (`salonstaff/salonstaff`) and Mailpit are published on all interfaces, so anyone on the same Wi-Fi can read the local database and every sign-in code. While `bun run phone` / `ios:device` runs, the whole local API is on the LAN: `dev-login` as anyone, the admin API through `X-Local-Staff`, and `/v1/dev/*`.
- **Fix:** Bind Docker ports to `127.0.0.1`. In the forwarder, refuse `/admin/*` and `/v1/dev/*`, bind to the chosen LAN address, and accept only the first client seen (or a per-run secret path prefix).

### S-15 Verification files and paid checks — Reported
- **Orphaned certificates:** `packages/db/src/checks.ts:387-465`, `apps/api/src/lib/storage.ts:83-102`. The key is nulled in the database before the R2 delete; a failed delete leaves the file forever with nothing pointing at it (D-03). Fix: R2 lifecycle rule on the private bucket as a backstop, or a `pending_deletes` table the cron retries.
- **Unlimited Stripe Identity sessions:** `apps/api/src/routes/checks.ts:159-166`. Every call makes a new paid session. Fix: reuse the open one; cap per account per day and in total.
- **Failed attempts stay at Stripe:** sessions are redacted only on `verified` (`billing.ts:292-306`). Redact failed and cancelled ones too.
- **Verified under any name:** `packages/db/src/checks.ts:234-249`. A check is `verified` even when the ID's name doesn't match the profile. Treat a mismatch as needing input, or make it impossible to miss on the applicant view.

### S-16 Upload limits apply after the body is read — Reported (ftyp sniff Checked)
- **Where:** `apps/api/src/lib/storage.ts:8-32`; upload routes in `me.ts`, `checks.ts`, `employer.ts`; `admin-salons.ts:793`.
- **Problem:** No `bodyLimit`, so the multipart body is parsed before the 8MB check. `?dry_run=true` returns before `requireUploadAllowance`, so the upload limiter doesn't apply. The HEIC sniff accepts any `ftyp` file (MP4, MOV), served from the CDN as `image/heic`. The admin CSV import parses its body before `requireStaff`.
- **Fix:** `bodyLimit` (about 9MB) before parsing on upload routes; call the limiter before the dry-run branch; check the `ftyp` brand; run the staff gate as middleware on `/admin/v1/*` before validation.

---

## Low

| ID | Where | Problem | Fix | Status |
|---|---|---|---|---|
| S-17 | `apps/api/src/app.ts:114-117`, `middleware/idempotency.ts` | Idempotency replay runs before `requireStaff` on admin POSTs, scoped by IP; anonymous callers can also fill the table | Skip it under `/admin/`, or run after the gate with the staff ID in the scope | Reported |
| S-18 | `lib/staff-context.ts:40-57`, `docs/runbooks/cloudflare-access.md` | A revoked Access session's token still verifies when sent straight to `api.salonstaff.com.au` until it expires | Runbook: removing the staff record is the kill switch. Shorten sessions; consider only accepting `/admin/` over the admin Worker's binding | Reported |
| S-19 | `packages/db/src/staff-office.ts:324-352` | A passkey confirmation is bound to action and target, not the body (`staff.add` works with any role) | Put the role or a body hash in the target | Reported |
| S-20 | `routes/admin-queues.ts:103-155` | Staff viewing certificates and visa details isn't audited; the file is served inline with no sandbox | Audit `check.document_viewed`; add `Content-Security-Policy: sandbox; default-src 'none'` | Reported |
| S-21 | `packages/shared/src/schemas.ts:293,311`, `admin-salons.ts:648,697`, `packages/db/src/back-office.ts:165` | Salon `website` is free text rendered as `href`; only React's `javascript:` block protects the site, nothing protects other consumers | Require `http(s)://` in one shared rule; restrict Instagram/TikTok handles to `[A-Za-z0-9._]` | Reported |
| S-22 | `apps/web/src/lib/session.ts:31-35` | `safeNext` accepts `/\evil.com`; used in a plain link at `routes/account.index.tsx:49` | Parse with `new URL(next, origin)` and require the same origin | Checked |
| S-23 | `apps/web/src/lib/upstream.ts:35-46` | The `/api/*` forwarder passes every path and header (admin, dev, docs, `X-Local-Staff`, `Cf-Access-Jwt-Assertion`). No bypass found, but only the API's own checks stand in the way | Forward only `/api/v1/`; delete those headers and `x-forwarded-*`; guard the `bindingMissing` localhost fallback to dev | Checked |
| S-24 | `apps/api/src/routes/directory.ts:170` | `page` taken from inside `path` skips validation: negative or infinite offset, 500 | Run it through `PageQuery` | Checked |
| S-25 | `apps/mobile/src/app/(app)/apply/[id].tsx:23,79` | A deep link shows any job under an attacker-chosen title, then applies | Load the job by ID and show the server's title and salon | Reported |
| S-26 | `apps/mobile/src/lib/push-notifications.ts:94`, `(auth)/verify-code.tsx:27` | Push URL `//host/…` resolves off-site; the code screen opens by deep link with someone else's address | Check the resolved origin; keep the sign-in target in memory | Reported |
| S-27 | `apps/mobile/src/lib/social-auth.ts` | Apple/Google ID tokens sent without a nonce (replayable until expiry) | Generate a nonce and pass it through | Reported |
| S-28 | `packages/auth/src/index.ts:143-151` | Google and Apple are trusted for automatic account linking by email | Confirm Better Auth refuses unverified provider emails for trusted providers in this version; otherwise drop Google from `trustedProviders` | Not traced |
| S-29 | `packages/db/scripts/migrate.ts`, `staff.ts`, `scripts/deploy.ts`, `apps/*/wrangler.jsonc` | Scripts follow `DATABASE_URL` with no local guard; deploy has no branch/clean-tree check or tests; local wrangler configs share production Worker names | Refuse non-local hosts without a flag; deploy only from clean `main`; rename local Workers and set `workers_dev: false` | Reported |
| S-30 | `.github/workflows/ci.yml`, `.gitleaks.toml`, `.github/dependabot.yml` | CI and secret scanning only run by hand; stale allowlists from kaybee; Dependabot covers Actions only | Run on push; prune the allowlist; add bun and `apps/mobile` to Dependabot | Reported |
| S-31 | `apps/api/src/lib/housekeeping.ts` | The cron drops only idempotency keys and stale evidence; expired codes, sessions, invites, dead claims and pending payments stay; no alert on failure | Purge them; catch and log a failure event | Checked |
| S-32 | `apps/api/src/routes/docs.ts:59-62` | The docs script's integrity attribute is added by string replace and silently does nothing if the markup changes | Throw or test when it's missing | Reported |
| S-33 | `packages/db/src/billing.ts:82-103` | Subscription sync trusts event order; two concurrent plan checkouts create two subscriptions | Fetch the subscription from Stripe; lock per salon | Reported |
| S-34 | `packages/db/src/back-office.ts:681` | The audit log keeps a deleted person's name and email, readable by the `readonly` role | Store the ID only, or restrict `before` for deletions | Reported |

## Design questions for Matt (not bugs)

- **Endorsements can be self-written.** A seeker can send the request to their own second address and write it themselves; with their own salon (S-03) it even shows "On Salon Staff".
- **Applying gives a salon the profile for good.** Hiding from a salon doesn't apply once you've applied to it.
- **Signed-in scraping.** Any account can page through every salon's phone, email and address (`/v1/salons/by-path`), at 300 requests a minute.
- **One ID can verify many accounts**, and a verified right to work on a visa never expires.
- **First passkey needs only Access**, so whoever controls a new staff member's inbox can enrol one (documented in `staff-passkeys.md`).
- **Tokens in page URLs** (`/endorse/{token}`, `/invite?token=`, `/claim/verify?token=`) are visible to the analytics beacon if auto-injection is on.

## Not security, found on the way

- `Permissions-Policy: geolocation=()` in `packages/config/security-headers.ts:81` disables the browser location that "near me" uses (`apps/web/src/components/near-me.tsx:116`). It will fail in production; dev skips the headers. Use `geolocation=(self)`.
- `bun audit`: 23 advisories, all in dev or build tooling (undici via wrangler, esbuild, sharp, minimatch). None against the runtime packages.

## Checked and sound

- **Staff gate:** Access JWT verified (RS256, issuer, audience), fails closed when unset, exact Origin for changes, role permissions match actions, last-owner guards, passkey challenges single-use and bound to staff, action and target.
- **Local stand-ins:** dev login, staff picker, `/v1/dev/*`, mock identity and checkout, `/media` all gated on the server by `ENVIRONMENT === "local"`, which no wrangler file sets.
- **CSRF and CORS:** cookie-authenticated changes need an allowed Origin; WebSockets too; CORS allows only our origins.
- **Ownership checks:** every `/v1/me/*` and `/v1/employer/salons/{salonId}/*` route goes through a scope bound to the caller or the salon; IDs of other people's rows return 404.
- **Stripe webhook:** signature over the raw body, 404 when secrets are unset, fulfilment locked and idempotent, amounts from the server.
- **Uploads:** type from magic bytes, no SVG or HTML, random keys, private bucket readable only by staff.
- **Website:** no `dangerouslySetInnerHTML` on user content, JSON-LD escaped, nonce CSP, share page payload stripped on the server, no secrets in the client bundle.
- **Mobile:** token in the Keychain, production URL forced and checked before upload, dev affordances behind `__DEV__` and the server gate.
