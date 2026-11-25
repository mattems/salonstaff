# D-08 Applicant trust at launch

**Status:** Accepted in principle (2026-11-25). **Not built — deferred** until after the initial phase; it needs
more thought before building (Matt). Until then the current behaviour stands: applying needs a profile and a passed
ID check (Stripe Identity), and right to work is checked by staff from the visa grant number (D-03).

**Decision.** At launch we keep bots, spam and ineligible applicants away from salons with basic, cheap layers. The full plan is in `docs/applicant-trust.md`.
- **Bot protection:** Cloudflare Turnstile on sign-up, profile and apply, plus caps on applications per account.
- **Australian mobile:** a verified Australian mobile is needed to apply. Twilio's line-type lookup rejects virtual and VoIP numbers, and each number can be on one account only.
- **Work rights:**
  - Seekers declare their right to work and confirm they live in Australia.
  - Each salon has a default work-rights requirement, and each job can override it.
  - `eligibilityOf` blocks the apply button when the declared work rights don't meet the job.
- **Application caps:** 10 a day and 4 an hour per job seeker to start. The numbers live in one place (`APPLY_LIMITS` in `packages/shared`) so they're easy to tune.
- **Visa holders:**
  - Work rights are checked with **My VEVO**. The visa holder emails their entitlement from Home Affairs to a unique Salon Staff address.
  - Staff confirm the conditions and give the "work rights checked" badge.
  - The email is deleted on decision, keeping only the basis and date. This replaces D-03's staff VEVO lookup by visa grant number and passport.
- **ID check:** **not required to apply at launch**. Stripe Identity stays available for an optional "ID checked" badge. Whether to require it, ask for it only when the risk score flags someone, or let salons ask for it per job is decided later, once we have real data.

**Why.** The old site was flooded by applicants who were overseas or had no work rights. An ID check doesn't stop that, because a genuine foreign passport passes. An Australian mobile plus declared work rights checked against the job does, at almost no cost or friction. Matt: "just have good basic verification for now and bot protection, mobile phone verification and work rights checking."

**Never.** No filtering or scoring on nationality, ethnicity, name, language or country of birth. Only on being in Australia and work rights.
