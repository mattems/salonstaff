# Runbook: sign-in providers

Email codes need only Resend ([resend.md](resend.md)); SMS codes need Twilio ([twilio.md](twilio.md)).

## Google
1. Google Cloud console → APIs & Services → Credentials → **OAuth client ID** → Web application.
2. Authorised redirect URI: `https://salonstaff.com.au/api/v1/auth/callback/google`
   (locally: `http://localhost:5300/api/v1/auth/callback/google`).
3. Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`wrangler secret put … --env production`; locally `apps/api/.dev.vars`).
4. For the mobile app later: iOS and Android OAuth clients; their client IDs are accepted as ID-token audiences.

## Apple
1. Apple Developer → Identifiers: an App ID (`au.com.salonstaff.app`) with Sign in with Apple, and a **Services ID**
   (e.g. `au.com.salonstaff.web`) with domain `salonstaff.com.au` and return URL
   `https://salonstaff.com.au/api/v1/auth/callback/apple`.
2. Keys → a key with Sign in with Apple → download the `.p8`.
3. Secrets: `APPLE_CLIENT_ID` (the Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the `.p8`
   contents). The API makes Apple's client-secret JWT from these itself.
4. Apple needs HTTPS and a verified domain, so it can't be tried on localhost.
