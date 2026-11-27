# Runbook: first deploy to Cloudflare

One environment (production). Do these once, in order. Labels in dashboards change; names may differ slightly.
Matt sets every secret himself; nothing here should be pasted into chat or committed.

## 1. Cloudflare
1. Add `salonstaff.com.au` to a Cloudflare account (nameservers at the registrar).
2. `bunx wrangler login` on your machine.

## 2. Database: PlanetScale Postgres → [planetscale.md](planetscale.md)
Create the database (pick an AWS region and put the same region in each `wrangler.jsonc` `placement`), the
`migrator` and `app` roles, and a Hyperdrive config. Put the Hyperdrive ID in `apps/api/wrangler.jsonc`
(`env.production.hyperdrive`).

## 3. R2
```bash
bunx wrangler r2 bucket create salonstaff-media
bunx wrangler r2 bucket create salonstaff-private
```
Connect `cdn.salonstaff.com.au` to `salonstaff-media` (R2 → bucket → Settings → Custom domains).
`salonstaff-private` gets no public access.

## 4. Admin protection → [cloudflare-access.md](cloudflare-access.md)
Set up Access for `admin.salonstaff.com.au` **before** deploying the admin portal. Put `ACCESS_TEAM_DOMAIN` and
`ACCESS_AUD` in `apps/api/wrangler.jsonc` (`env.production.vars`).

## 5. Secrets (API Worker)
```bash
cd apps/api
bunx wrangler secret put AUTH_SECRET --env production        # openssl rand -base64 48
bunx wrangler secret put RESEND_API_KEY --env production      # resend.md
bunx wrangler secret put ABR_GUID --env production            # abn-lookup.md
```
Later, as each is set up: Google/Apple ([set-up-sign-in.md](set-up-sign-in.md)), push notifications
([push-notifications.md](push-notifications.md)), Twilio ([twilio.md](twilio.md)),
Stripe ([stripe.md](stripe.md)).

## 6. Deploy
```bash
export PRODUCTION_DATABASE_URL='<migrator role URL>'   # type it in your own terminal
bun run deploy
```
`bun run deploy` migrates the database with the migrator role, then deploys the API, the website and the admin portal.
The custom domains in each `wrangler.jsonc` are created on first deploy, and so is the API's Durable Object for
live conversations (`ConversationRoom`, D-18: its `migrations` entry creates it).

## 7. First staff member and data
```bash
DATABASE_URL="$PRODUCTION_DATABASE_URL" bun --cwd packages/db scripts/staff.ts --email you@salonstaff.com.au --name "Matt" --role owner
```
Add the same address to the Access policy. Import directory listings from the admin portal (Directory import).

## Check
- https://api.salonstaff.com.au/readyz → `{"status":"ok"}`
- https://salonstaff.com.au loads, and `/sitemap.xml` lists jobs and salons.
- https://admin.salonstaff.com.au asks for an email PIN first.
- Sign up with an email code; the code arrives from Resend.
