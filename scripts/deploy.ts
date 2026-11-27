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

// What's deployed is what's on main, committed and pushed: not a branch, and not work in progress
// (its migrations would run on production). `--any-tree` deploys what's here anyway.
if (!process.argv.includes("--any-tree")) {
  const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
  const dirty = (await $`git status --porcelain`.text()).trim();
  await $`git fetch origin main`.quiet().nothrow();
  const [head, main] = await Promise.all([
    $`git rev-parse HEAD`.text(),
    $`git rev-parse origin/main`.nothrow().text(),
  ]);
  const problem =
    branch !== "main"
      ? `You're on ${branch}, not main.`
      : dirty
        ? "There are uncommitted changes."
        : head.trim() !== main.trim()
          ? "main isn't the same as origin/main (push or pull first)."
          : null;
  if (problem) {
    console.error(
      `✗ ${problem} Deploy from a clean, pushed main, or pass --any-tree to deploy this anyway.`,
    );
    process.exit(1);
  }
}

console.log("• Checks (lint, typecheck, tests)…");
await $`bun run lint`;
await $`bun run typecheck`;
// Needs the local Postgres (docker compose up). `--skip-tests` when it can't run.
if (!process.argv.includes("--skip-tests")) await $`bun run test`;

console.log("• Migrating the production database…");
await $`bun scripts/migrate.ts`
  .cwd(resolve(root, "packages/db"))
  .env({ ...process.env, DATABASE_URL: url, ALLOW_REMOTE_DATABASE: "1" });

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
