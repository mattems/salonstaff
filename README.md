# Salon Staff

Australia's hair & beauty jobs board: salons post jobs, ID-verified job seekers apply, and a public
directory lists every salon (owners claim theirs). Runs on Cloudflare Workers with PlanetScale Postgres.

- [Docs](docs/README.md) · [Status](docs/STATUS.md) · [Conventions](docs/conventions.md) ·
  [Architecture](docs/architecture.md) · [Runbooks](docs/runbooks/)

## Development

Needs [Bun](https://bun.sh), Node (version in `.nvmrc`) and Docker Desktop (running).

```bash
bun run setup   # first time: install, .env, .dev.vars, Docker (Postgres, Mailpit), migrate, demo data
bun dev         # start everything
```

`bun dev` opens the **springboard** at http://localhost:4100: every service, whether it's running,
common commands and the local accounts.

| Address | What |
|---|---|
| http://localhost:4100 | Springboard |
| http://localhost:5300 | The website (salonstaff.com.au) |
| http://localhost:5301 | The admin portal (admin.salonstaff.com.au) |
| http://localhost:8890/docs | API reference (`/v1/openapi.json` for machines) |
| http://localhost:8890/readyz | API can reach its database |
| http://localhost:8036 | Mailpit: every email and SMS code sent locally |

Postgres is on port 54349 and Mailpit on 8036, so this runs beside kaybee and uptime.

Sign in on the website with an email or mobile code (it arrives in Mailpit), or **Dev login**
(local only). `bun db:seed` adds a demo seeker (`seeker@salonstaff.test`), demo salon owners
(`owner1@salonstaff.test`…) and makes `STAFF_EMAIL` from `.env` a staff owner for the admin portal.

```bash
bun run ci          # every check, locally (gitleaks, lint, typecheck, tests, builds, drift checks)
bun run lint        # Biome
bun run format
bun run typecheck
bun run test        # needs the Docker services
bun db:generate -- --name <name>   # a migration after changing packages/db/src/schema.ts
bun db:migrate      # apply migrations locally
bun db:reset        # empty the local database and migrate again
bun db:seed         # demo data (safe to re-run)
bun db:studio       # browse the local database
bun db:staff -- --email you@example.com --role owner   # admin portal access
bun run api:types   # regenerate the website's and admin portal's typed API clients
```

## Production

One environment: salonstaff.com.au (website), api.salonstaff.com.au (API, mobile, webhooks),
admin.salonstaff.com.au (admin portal behind Cloudflare Access), cdn.salonstaff.com.au (public
pictures). First time: [docs/runbooks/first-deploy.md](docs/runbooks/first-deploy.md). After that:
`bun run deploy`.

## Layout

| Path | What |
|---|---|
| `apps/api` | Hono API on a Worker (website, admin portal, mobile app) |
| `apps/web` | The website: TanStack Start, server-rendered on a Worker |
| `apps/admin` | The admin portal (React + Vite, from kaybee) |
| `apps/springboard` | Local launcher, never deployed |
| `apps/mobile` | Expo job seeker app, parked until the website is done |
| `packages/*` | `db`, `shared`, `auth`, `email`, `ui`, `config` |
| `docs/` | Status, conventions, architecture, decisions, runbooks |
