/**
 * Deploys production: migrates the database, then deploys the API, the website and the admin portal.
 * Needs `bunx wrangler login` and PRODUCTION_DATABASE_URL (the PlanetScale migrator role) in your shell.
 * See docs/runbooks/first-deploy.md.
 */
import { resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
$.cwd(root);

// biome-ignore lint/suspicious/noUndeclaredEnvVars: typed in the deployer's own shell, never stored.
const url = process.env.PRODUCTION_DATABASE_URL;
if (!url) {
  console.error(
    "PRODUCTION_DATABASE_URL is not set (the PlanetScale migrator role). See docs/runbooks/first-deploy.md.",
  );
  process.exit(1);
}

console.log("• Checks (lint, typecheck)…");
await $`bun run lint`;
await $`bun run typecheck`;

console.log("• Migrating the production database…");
await $`bun scripts/migrate.ts`
  .cwd(resolve(root, "packages/db"))
  .env({ ...process.env, DATABASE_URL: url });

console.log("• Deploying the API…");
await $`bunx wrangler deploy --env production`.cwd(resolve(root, "apps/api"));

console.log("• Building and deploying the website…");
await $`bun run build`.cwd(resolve(root, "apps/web"));
await $`bunx wrangler deploy --env production`.cwd(resolve(root, "apps/web"));

console.log("• Building and deploying the admin portal…");
await $`bun run build`.cwd(resolve(root, "apps/admin"));
await $`bunx wrangler deploy --env production`.cwd(resolve(root, "apps/admin"));

console.log(`
Deployed. Check:
  https://api.salonstaff.com.au/readyz
  https://salonstaff.com.au
  https://admin.salonstaff.com.au   (should ask for a Cloudflare Access PIN first)
`);
