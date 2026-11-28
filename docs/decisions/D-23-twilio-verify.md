# D-23 Codes by Twilio Verify

**Status:** Accepted (2026-11-28).

**Decision.** SMS and voice codes are made, sent and checked by Twilio Verify (one Verify service,
"Salon Staff", in a subaccount of the company's Twilio account):

- **Sign-in and mobile-change codes** by SMS: Better Auth's phone plugin asks Verify to send
  (`sendOTP`, its own code ignored) and to check (`verifyOTP`).
- **Claim codes** (D-22) by SMS to a listing's mobile, or a voice call to its landline. The claim keeps
  `code_service = 'twilio_verify'` and no code hash (migration 0016); our own limits still apply
  (5 wrong codes, calling hours, a new code at most every 5 minutes, 5 claims a day). Verify's codes
  last 10 minutes, which the claim's `codeExpiresAt` shows. If Twilio won't send, the claim is closed
  ("The code couldn't be sent") and can be started again straight away.
- **Emails** stay ours (the claim email with its code and link, sign-in codes by email).

Without `TWILIO_VERIFY_SERVICE_SID` everything works as before: our own codes, sent through
`SmsSender`.

**Locally,** real texts and calls only ever go to the numbers in `TWILIO_LOCAL_ALLOW` (Matt's own).
The directory holds real salons' numbers, and nothing should reach them from a laptop. Sign-in with
another number is refused while Verify is set; a claim on another listing falls back to our own code
in Mailpit. This applies to plain texts and calls through `TWILIO_FROM` too.

**Why.** Matt has Twilio in the company account. Verify handles delivery, retries, Australian sender
rules, fraud protection (Fraud Guard) and voice calls to landlines, so we don't need our own number or
sender ID registration for codes.

**Trade-off.** Verify's messages are its own template ("Your Salon Staff verification code is: …"), so
a claim's SMS or call no longer says who asked or which salon (our email still does). A custom
template could be registered with Twilio later.
