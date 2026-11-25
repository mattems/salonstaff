# Runbook: SMS codes (Twilio)

1. Twilio → buy an Australian number, or register an alphanumeric sender ID for Australia.
2. Secrets on the API Worker: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (the number or sender ID).
3. Try it: sign in on the website with "Mobile".

Without these, production refuses SMS sign-in with a clear error; locally codes go to Mailpit as
`sms+<number>@local.test`.
