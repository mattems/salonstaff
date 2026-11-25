/**
 * First-time setup: creates .env, starts the Docker services and migrates
 * the database. Safe to run again at any time.
 */
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
$.cwd(root);

const envFile = resolve(root, ".env");
if (existsSync(envFile)) {
  console.log("• .env already exists, leaving it alone");
} else {
  copyFileSync(resolve(root, ".env.example"), envFile);
  console.log("• Created .env from .env.example");
}

await $`bun scripts/dev-vars.ts`;

console.log("• Starting Postgres and Mailpit (Docker)…");
await $`docker compose up -d --wait`;

console.log("• Applying database migrations…");
await $`bun run db:migrate`;

console.log("• Adding demo data (salons, jobs, directory listings, a staff owner)…");
await $`bun run db:seed`;

console.log(`
Ready. Next:
  bun dev                      start everything
  http://localhost:4100        Springboard: links to everything, and whether it is running
  http://localhost:5300        The website
  http://localhost:5301        The admin portal
  http://localhost:8890/docs   API reference
  http://localhost:8036        Mailpit: every email and SMS code sent locally
`);
