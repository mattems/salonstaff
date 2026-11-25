# Runbook: PlanetScale Postgres + Hyperdrive

1. **Create the database.** PlanetScale → New database → **Postgres**. Region: AWS Sydney (`ap-southeast-2`) is
   closest to Australian users; use the same region in each Worker's `placement.region`.
2. **Two roles** (PlanetScale → Roles):
   - `migrator`: permission to change the schema. Used only by `bun run deploy` to run migrations.
   - `app`: `pg_read_all_data` + `pg_write_all_data`. Used only by the Workers, through Hyperdrive.
3. **Hyperdrive.** Cloudflare → Hyperdrive → Create, with the `app` role's connection string:
   ```bash
   bunx wrangler hyperdrive create salonstaff --connection-string='<app role URL>'
   ```
   Put the printed ID in `apps/api/wrangler.jsonc` → `env.production.hyperdrive[0].id`.
4. **Migrations** run from your machine with the migrator URL (`PRODUCTION_DATABASE_URL`) during `bun run deploy`.
   `packages/db/scripts/migrate.ts` turns on TLS verification for any non-local host.

Rotating a password: [rotate-a-secret.md](rotate-a-secret.md).
