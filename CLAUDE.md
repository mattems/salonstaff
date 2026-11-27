# Salon Staff

An Australian hair & beauty jobs marketplace: salons post jobs, job seekers with a verified Australian mobile and
declared work rights apply (D-08), and a
public directory lists every salon (owners claim theirs). Owner: Matt. Domain: salonstaff.com.au.

**Read first:** `docs/STATUS.md` (where things stand), then `docs/README.md`. Before changing an area,
read its section of `docs/conventions.md`.

The foundations were copied from `~/www/kaybee` and trimmed: Salon Staff is a much simpler product.
When unsure how something is done, kaybee is the reference, but don't bring its complexity back.

## How we work

- **Matt commits.** Don't commit, push or open pull requests unless he asks.
- **Never ask for, paste or enter secrets.** Matt sets them himself (`.dev.vars`, `wrangler secret put`).
- **The website has no design yet.** Use plain shadcn components with the default theme; don't
  invent colours, fonts or layouts. The admin portal is always basic shadcn.
- Keep docs short and current: update `docs/STATUS.md` with every change of substance.
- Decisions are recorded in `docs/decisions/` (one short file each).

## Checking your work

- `bun run ci` runs every check locally (needs Docker Postgres). Quick loop: `bun run lint`,
  `bun run typecheck`, `bun run test`.
- After changing `packages/db/src/schema.ts`: `bun db:generate -- --name <name>`.
  After changing any API route: `bun run api:types`.

## Commands

```bash
bun run setup   # first time: install, .env, .dev.vars, Docker (Postgres, Mailpit), migrate, seed
bun dev         # everything, linked from the springboard at http://localhost:4100
bun run deploy  # production (docs/runbooks/first-deploy.md)
```

## Layout

| Path | What |
|---|---|
| `apps/api` | Hono on a Cloudflare Worker: `/v1/*` (website + mobile), `/v1/auth/*` (Better Auth), `/admin/v1/*`; the `ConversationRoom` Durable Object for live conversations (D-18) |
| `apps/web` | TanStack Start (SSR) on a Worker: salonstaff.com.au. Forwards `/api/*` to the API |
| `apps/admin` | React + Vite admin portal from kaybee: admin.salonstaff.com.au, behind Cloudflare Access |
| `apps/springboard` | Local launcher (:4100), never deployed |
| `apps/mobile` | Expo job seeker app on the current API (bearer token). Its own npm project, not in the workspaces: check it with `npx tsc --noEmit` there |
| `packages/db` | Drizzle schema, migrations, all data access (scopes) |
| `packages/shared` | Constants, zod schemas, IDs, errors, staff roles, and the pure rules (`rules.ts`, `urls.ts`) |
| `packages/auth` | Better Auth: Google, Apple, email code, SMS code, bearer (mobile) |
| `packages/email`, `ui`, `config` | Email templates + sender (Resend/Mailpit), shadcn/ui, shared config |
| `tools/directory` | Standalone script that builds the directory's import CSVs (D-09); not a workspace, never touches the DB |

## Rules that apply everywhere

- **Data access goes through scopes in `packages/db`** (`publicSite`, `seeker`, `signIns`, `salonScope`,
  `claims`, `checks`, `myPushDevice`/`pushDevicesOf`, `notificationSettings`, `salonConversations`/`seekerConversations`, `backOffice` behind the staff gate, `housekeeping` in the cron). The API never
  imports tables; a test enforces it.
- **Rules that decide things are pure functions with table tests** in `packages/shared`
  (`entitlementOf`, `eligibilityOf`, `verificationLevel`, `jobPath`/`parseJobsPath`…). Change a rule there only.
- **API:** OpenAPI routes on `createRouter()`; errors are `ApiError(code, { detail, hint })`, always with a
  hint; IDs prefixed at the edge (`encodeId`/`decodeId`); audit every change with `recordAudit` in the same
  transaction; honour `c.get("dryRun")`. Admin routes start with `requireStaff(c, permission)`.
- **Verification data:** once a check is decided keep only its verification ID (`SSV-…`), outcome and date.
  Never store ID images; delete certificates and visa numbers on decision (D-03).
- **Public URLs** come from `packages/shared/src/urls.ts` only (D-07). Renames write a 301 redirect.
- **Local-only stand-ins** (dev login, staff picker, mock identity check, mock checkout, SMS to Mailpit)
  exist only when `ENVIRONMENT` is `local`. `ENVIRONMENT` is never set in wrangler; unset means production.
- Migrations are forward only and must work with the code already deployed.
- Tests share one database and run in parallel: never change rows you didn't create.
