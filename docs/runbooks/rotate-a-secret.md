# Runbook: rotate a secret

| Secret | Where | How |
|---|---|---|
| `AUTH_SECRET` | API Worker | `wrangler secret put AUTH_SECRET --env production`. Signs everyone out. |
| `RESEND_API_KEY`, `TWILIO_*`, `STRIPE_*`, `GOOGLE_*`, `APPLE_*`, `ABR_GUID` | API Worker | Make a new one at the provider, `wrangler secret put …`, then revoke the old one. |
| Database `app` role password | Hyperdrive | PlanetScale → reset password → `wrangler hyperdrive update <id> --connection-string=…` |
| Database `migrator` role password | Your machine only | Reset in PlanetScale; use the new URL next time you run `bun run deploy`. |

Run `wrangler` commands from `apps/api`. Type secrets into your own terminal, never into chat or files.
