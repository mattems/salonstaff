# D-22 Adding a salon: find it first, claim by code, photos

**Status:** Proposed (2026-11-28). Built; calls to landlines added at Matt's request. Matt to confirm
the open questions below.

**Decision.** "Add a salon" (`/employer/onboarding`) is a wizard that looks for the salon before
anyone types its details, since most salons are already in the directory (D-09):

1. **Find your salon:** its name and postcode. `GET /v1/salons/matches` offers listed salons with a
   name like it (`nameMatchScore` in `rules.ts`: the words that tell names apart, ignoring "hair",
   "studio", "salon" and the like) in that postcode or within 15km, best first, up to 8. Claimed
   ones and ones you're already on are marked.
2. **Confirm or add it:** "This is mine" claims the listing in place; "Add … as a new salon" goes to
   the details form. If the ABN typed there belongs to a listing, the wizard offers that listing's
   claim instead (the API's 409, as before).
3. **Add your photos:** a cover photo and logo, shown as the page will look; skippable, and on the
   salon's details page later (`POST`/`DELETE /v1/employer/salons/{id}/logo` and `/hero`, owners only,
   migration 0014 adds `salons.hero_key`).

**Claiming (amends D-04).** Proof of control, by a six-digit code the claimant types in the wizard.
The ABN is optional when a code proves it (Matt: businesses should still be able to add one); one
that's given must match the listing's (or be active on the ABR when the listing has none), and once
checked the salon shows as a verified business. Without one the listing keeps its own, unconfirmed,
and the owner can add it under Salon details. A staff check still needs an ABN: it's all staff have to
go on. Migration 0015 lets `salon_claims.abn` be empty.

- **Email:** the code (and, as before, a link) to the listing's own email.
- **SMS:** the code to the listing's own number when it's an Australian mobile (`claimMethods`).
- **Call:** when the listing's number is a landline (02, 03, 07, 08; not 13/1300/1800, which are
  routed) or a mobile (Matt: a mobile can take a text or a call), a Twilio call reads out the code. Only between 8am and 8pm in the
  salon's state (`withinCallingHours`); outside those hours the option is shown but can't be chosen.
- **Staff review** when neither is possible or reachable, as before.

Safeguards: codes only go to details already on the listing, never ones the claimant types, and are
shown masked (`he•••@salon.com`, `04•• ••• 678`); the message names who asked; only the account that
started the claim can use the code; 5 wrong codes and it stops (`CLAIM_CODE_ATTEMPTS`); only hashes are
stored; a new code at most every 5 minutes, and each start counts towards the 5 claims a day (a
replaced claim is kept as "Started again" rather than deleted, so a fresh code doesn't mean fresh
guesses); the claimant ticks that they run the business; existing owners are emailed when someone else
claims (D-11). The emailed link from before still works.

**Open (Matt):**
- Whether a listing's phone or email should be checked against other sources first (D-09's data can
  be stale, and whoever has an old number gets the code). Staff can reject and the owner is told.
