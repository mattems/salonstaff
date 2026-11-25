# D-03 Verification: keep the verification ID, not the documents

**Status:** Accepted (2026-11-25)

**Decision.**
- **Identity:** Stripe Identity (government ID + live selfie). ID images never reach our servers. On a pass we
  keep a verification ID (`SSV-XXXX-XXXX`), the date and whether the name matched the profile, then ask Stripe
  to redact the session (deleting the images there too).
- **Right to work (built now):** the seeker declares a basis (citizen / PR / visa); visa holders give their grant
  number and passport country, which staff check in VEVO. Those two fields are erased as soon as staff decide; we
  keep the basis and how it was checked.
- **Right to work (planned, D-08, not built):** visa holders email their My VEVO entitlement to a one-off Salon Staff
  address instead; the email sits in the private bucket only until staff decide, then it's deleted, and we never ask
  for visa grant or passport numbers.
- **Qualification:** the certificate sits in a private R2 bucket only until staff decide, then it's deleted; we
  keep the qualification's title.
- Evidence for checks nobody reviews within 30 days is deleted by the daily cron.
- Salons see the verification IDs and badges, never documents.

**Why.** Matt: "once verified we should not store the users verification documents, only a verification id."
It also keeps us out of holding identity documents under the Privacy Act.

**Open.** Stripe Identity checks document authenticity and the selfie; it doesn't query the Australian DVS. If
DVS matching is wanted later, swap the provider (the checks scope is provider-agnostic).
