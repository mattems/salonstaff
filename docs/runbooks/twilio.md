# Runbook: SMS codes and calls (Twilio)

Codes are sent and checked by **Twilio Verify** (D-23): sign-in and mobile-change codes by SMS, and
salon claim codes by SMS to a listing's mobile or a voice call to its landline. Twilio makes the
code, sends it (in its own words: "Your Salon Staff verification code is: 123456") and checks it.

## Set up (once, in Twilio)

1. In the company's Twilio account, make a **subaccount** called "Salon Staff" (Account → Subaccounts),
   so its usage and bills are separate. Use the subaccount's **Account SID** and **Auth Token**.
2. **Verify → Services → Create**: friendly name **Salon Staff** (it's in every message), code length
   **6**, channels **SMS** and **Voice** on. Note the service's SID (`VA…`).
3. **Verify → Geo permissions** (or the service's settings): allow **Australia** for SMS and Voice.
   Turn on **Fraud Guard** for SMS.
4. Nothing else: Verify sends from Twilio's own numbers, so no number or sender ID is needed for codes.

## Try it locally

1. In `apps/api/.dev.vars` (Matt sets these; they're secrets):
   ```
   TWILIO_ACCOUNT_SID=AC…
   TWILIO_AUTH_TOKEN=…
   TWILIO_VERIFY_SERVICE_SID=VA…
   TWILIO_LOCAL_ALLOW=+614xxxxxxxx,+613xxxxxxxx
   ```
   `TWILIO_LOCAL_ALLOW` is your own mobile (and a landline you can answer, for calls). **Locally,
   no other number ever gets a real text or call**: the imported directory is real salons. Sign-in
   with any other number is refused while Verify is set; claims on other listings fall back to our
   own codes in Mailpit (http://localhost:8036).
2. Restart `bun dev` so the API reads them.
3. **Sign-in:** the website's sign-in → Mobile → your number. The code comes by SMS from Twilio.
4. **Claim by SMS:** in the admin portal, open an unclaimed listing (Salons) and set its phone to your
   mobile. Then Add a salon → find that listing → "This is mine" → "Text a code to the salon's mobile".
5. **Claim by call:** "Call the salon's phone with a code", on a listing with your mobile or a
   landline you can answer (02/03/07/08), between 8am and 8pm in the listing's state. Verify rings
   and reads out the code.

## Deployed

Secrets on the API Worker (`wrangler secret put …`): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_VERIFY_SERVICE_SID`. `TWILIO_LOCAL_ALLOW` is ignored outside local. `TWILIO_FROM` (a number or
an alphanumeric sender ID) is only for texts that aren't codes: notices to accounts with no email, and
the note to an old number after a mobile change.

## Without Verify

Leave out `TWILIO_VERIFY_SERVICE_SID` and we make the codes ourselves: they're texted from `TWILIO_FROM`
and calls come from `TWILIO_VOICE_FROM` (a voice-capable number, or `TWILIO_FROM` when that's a
number). Locally without Twilio, texts go to Mailpit as `sms+<number>@local.test` and calls as
`call+<number>@local.test` (the words the call would say). Production refuses SMS sign-in with a clear
error when neither is set.
