# Applicant trust: keeping bots, spam and ineligible applicants away from salons

**Status:** Agreed in principle in D-08 (2026-11-25). **Deferred: not built, and needs more thought before it is**
(Matt). Until then, applying needs a profile and a passed ID check, as built.

## The problem

When the old Salon Staff ran, salons were flooded with applications from people who:
- weren't in Australia, and/or didn't have Australian work rights, even on jobs that said "must have Australian work rights"
- were bots or scripts, or used AI to mass-apply with copy-paste cover notes
- were spammers or plainly unqualified.

Every bad application costs a salon time and costs us their trust. We need early detection on day one that we can keep tightening.

## What the current plan already covers, and the gap

The plan is already in the code:
- sign-in by Google, Apple, email code or SMS code, where SMS only accepts **Australian mobiles** (D-02)
- an ID check before applying, using Stripe Identity (government ID + selfie)
- a declared `rightToWork` on the profile
- staff VEVO checks for the right-to-work badge (D-03).

**The gap:** an ID check proves someone is a real person holding a real document. It doesn't prove they're in Australia or allowed to work here. A person overseas with a genuine foreign passport passes Stripe Identity. Also:
- jobs can't yet say "work rights required"
- nothing checks the declared work rights against the job
- nothing watches *how* people apply.

## Principles

1. **Filter on location and work rights, never on nationality.** "In Australia now and allowed to work" is a lawful, job-related requirement. Employers must not employ people without work rights. Filtering or scoring on nationality, ethnicity, name, language or country of birth is not allowed (Racial Discrimination Act). Nothing below uses those.
2. **Cheap checks for everyone, expensive checks only when needed.** Everyone gets free or very cheap checks (bot challenge, Australian mobile, declared work rights). Paid checks (ID, VEVO, DVS) are for when the signals say so or the job asks for it.
3. **Hold, don't silently reject.** A suspicious application is held and staff or a step-up check decide. Proven bots and spam are dropped. Real people always get a way to fix it.
4. **Every rule is a pure function in `packages/shared` with table tests**, like `eligibilityOf`. Tuning a threshold is a one-line change.
5. **Keep as little as possible.** Store country codes, flags and scores, not raw IP addresses or device fingerprints. Mention fraud checks in the privacy policy and collection notice.

## The layers

### 1. Stop bots at the door (free)

- **Cloudflare Turnstile** (invisible) on sign-up, profile creation and apply.
- **Application caps** per account: 10 a day and 4 an hour to start, set in one place (`APPLY_LIMITS` in `packages/shared`) so they can be tuned. If we end up tuning them often, make them an admin setting. Real people rarely apply to 30 salons in an afternoon. The per-IP rate limiter we already have stays.
- **Cloudflare request data** on every sign-up and apply: `cf.country` and `cf.asn`. Store just the country code and a "hosting or VPN network" yes/no on the account (a short list of datacentre networks). Don't keep the IP.

### 2. An Australian mobile is the anchor (about a cent per person)

The biggest single lever against overseas applicants:
- **To apply, you need a verified Australian mobile**, even if you signed up with Google, Apple or email. This uses the SMS code flow we already have, which only accepts `+614…`.
- **Twilio Lookup (line type)** when the number is added. Reject virtual and VoIP numbers (`nonFixedVoip`), which is how overseas people usually get an Australian number. Check Twilio's current price; it's a cent or two per lookup.
- **One mobile per account.** A number already used by another account, or a suspended one, is flagged.
- In Twilio, **only allow SMS to Australia**. This also blocks SMS-pumping fraud.

### 3. The job states its requirement, and applicants have to meet it (free)

- **A work-rights requirement**, either `any` or `required`. "Required" accepts citizen, PR or a visa with full work rights.
  - **Salon default:** each salon sets its own default in its settings (`salons.default_work_rights`). New salons start on `required`, since that's what most old job ads asked for.
  - **Per job:** new jobs copy the salon's default, and the salon can change it on each job (`jobs.work_rights`).
- **Applicants declare their right to work and confirm they're in Australia.** This already sits on the profile; add "I'm currently living in Australia" and a declaration that false answers lead to removal.
- **`eligibilityOf` blocks the apply button** when the declared work rights don't meet the job's requirement. The new blocker is `work_rights`: "This salon needs full Australian work rights". People who need sponsorship can't apply to those jobs at all, which removes the worst of the old flood before it reaches salons.
- Optional later: a "within *X* km" option on a job, using the profile postcode against the job postcode.

### 4. Watch how people apply (free, our own code)

A pure rule, `applicantRiskOf(signals) → { level, reasons[] }`, where level is `ok`, `review`, `step_up` or `block`. It runs on every application.

| Signal | Example | Weight |
|---|---|---|
| Not in Australia | Signed up or applying from an IP outside Australia | High (`step_up` on a work-rights job) |
| Hosting or VPN network | Applying from a datacentre network | Medium |
| Browser timezone | Not `Australia/*` (the web app sends it) | Low |
| Too fast | Several applications within a minute, or 5 salons within 2 minutes of the jobs going live | Medium–high |
| Copy-paste | The same cover note across many applications, or across different accounts (we compare a short fingerprint of the text, not the text itself) | Medium; across accounts it's high |
| Cover note contradicts the profile | Mentions sponsorship or a visa on a work-rights job when the profile says citizen | Medium |
| Spam content | Links, contact details or crypto/WhatsApp patterns in the cover note | High |
| Duplicate person | Same mobile or profile photo as another account | High |
| Salon reports | Another salon reported this person (see 6) | High |
| Brand-new account | Created minutes ago and applying to many jobs | Low |

"Written with AI" is **not** a signal. Plenty of real people use it to write a note, and the detectors are unreliable. The copy-paste and speed signals catch the mass-appliers anyway.

**What happens at each level:**
- **ok:** delivered as normal.
- **review:** delivered to the salon, but goes into the staff queue in admin.
- **step_up:** **held** (salons can't see it). The applicant is asked to pass a check (ID, or right to work for visa holders) before it's sent. They see "Almost there: verify to send your application".
- **block:** dropped, the account is flagged (`user_flags`) and staff decide whether to suspend (`users.suspended_at`).

### 5. Step-up checks (paid, only when needed)

- **Identity check:** Stripe Identity, as in D-03. It proves a real person and document. **Not required to apply at launch** (D-08). It's an optional "ID checked" badge for now. Later we decide between requiring it, asking for it only when the risk score flags someone, or letting salons ask for it per job.
- **Right to work (visa holders):** **My VEVO** (D-08).
  1. The seeker taps "Check my work rights" and gets their own address, e.g. `vevo-7k3m9qxa@checks.salonstaff.com.au`.
  2. In Home Affairs' My VEVO, they email their entitlement to that address.
  3. Cloudflare Email Routing hands it to an Email Worker. The worker files it in the private bucket against that person's check, which shows up in the staff queue.
  4. Staff confirm the name matches and the visa allows the work, then approve.
  5. The email is deleted and we keep only the basis (visa, full or limited) and the date (D-03).

  Citizens and PRs declare for now, backed by the Australian mobile and the risk score.
  Still to confirm with a test: that My VEVO accepts a sub-address like this, and what the email looks like.
- **Later:** a DVS-capable provider can check that an Australian licence, Medicare card, or a foreign passport with a current Australian visa matches government records (see `docs/idmatch-research.md`). That's the strongest "in Australia legitimately" signal we can get without VEVO. ConnectID or myID could make it a one-tap step.

### 6. Salons close the loop (free)

- **A "Report applicant" button** on each application, with reasons: not in Australia, no work rights, spam or bot, inappropriate.
- Reports from **2 different salons** hold that person's pending applications and put them in the staff queue.
- Salon filters: "Only show ID-checked" and "Only show work-rights-checked".

### 7. Staff tools (admin)

- An **applicant risk queue**: held and review applications with their reasons, plus approve, ask for a check, drop, or flag or suspend.
- Weekly numbers: applications held or dropped, reports per 100 applications, and how many held people later passed a check (our false-positive rate).
- An appeal path: a suspended person can email support, and staff can lift the hold.

## Data changes (when built)

- `salons.default_work_rights`: `any` | `required` (new salons start on `required`).
- `jobs.work_rights`: `any` | `required`, copied from the salon's default when the job is created.
- `seeker_checks` for `right_to_work` gets `provider: "my_vevo"` and an inbound address token, so the email lands on the right check.
- `applications.status` gets `held`. Also new fields `applications.risk_level` and `applications.risk_reasons` (jsonb).
- `seeker_profiles.in_australia_confirmed_at`.
- `users`: `signup_country`, `last_country`, `phone_line_type`, `phone_checked_at`.
- `application_reports` (application, salon, reason, created).
- New pure rules in `packages/shared/src/rules.ts`: `meetsWorkRights(declared, required)`, `applicantRiskOf(signals)`, `applyLimitOf(counts)`, plus the new `work_rights` blocker in `eligibilityOf`.

## Rollout

**Phase 1 (before launch).** Covers most of the old problem.
- Turnstile.
- Application caps (`APPLY_LIMITS`).
- Verified Australian mobile required to apply, with the Twilio line-type check.
- Salon default and per-job work-rights requirement, with the eligibility block.
- "In Australia" confirmation.
- My VEVO email flow with a staff check.
- Record the country and hosting-network flag.
- Held applications and a basic staff queue.
- The salon report button.
- Take the ID check out of `eligibilityOf`.

**Phase 2 (first months).**
- The full `applicantRiskOf` score with copy-paste, speed and duplicate signals.
- Step-up holds.
- Automatic holds after salon reports.
- Weekly numbers.
- Decide what the ID check is for.

**Phase 3 (as we grow).**
- DVS-capable identity provider (Australian document or visa match).
- ConnectID or myID.
- Tune the weights from real report data.

## Decided (2026-11-25, D-08)

1. **ID check:** not required to apply at launch. We'll decide later with real data.
2. **Work rights:** a salon-wide default, changeable on each job. New salons start on `required`.
3. **Caps:** 10 a day and 4 an hour, kept in one place so they can be tuned.
4. **Visa holders:** My VEVO email, checked by staff.
