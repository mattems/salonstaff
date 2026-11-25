# Runbook: local setup

```bash
bun run setup    # install, .env, .dev.vars, Docker (Postgres 54349, Mailpit 8036), migrate, seed
bun dev          # API :8890, website :5300, admin :5301, springboard :4100
```

- Put your own email in `STAFF_EMAIL` in `.env` before `bun run setup` (or run `bun db:staff …` later) to use the
  admin portal.
- Optional real keys go in `apps/api/.dev.vars` (never committed): `ABR_GUID`, Google, Twilio, Stripe sandbox.
- Everything sent (emails and SMS codes) is in Mailpit.
- Start over: `bun db:reset && bun db:seed`.
