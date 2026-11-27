/**
 * Applies pending migrations to the database in DATABASE_URL.
 * Used locally (`bun db:migrate`) and by the deploy workflows.
 */
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Locally, run `bun run setup` to create .env.");
  process.exit(1);
}

let target: URL;
try {
  target = new URL(url);
} catch {
  console.error(
    "DATABASE_URL is not a valid connection string. Expected postgres://user:password@host:5432/database. If the password contains characters such as @ : / ? # they must be percent-encoded.",
  );
  process.exit(1);
}

const isLocal = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
// A database that isn't on this machine is production: only on purpose. Without this, a
// DATABASE_URL left in the shell would send `bun dev`'s migrations (or a staff change) there.
if (!isLocal && process.env.ALLOW_REMOTE_DATABASE !== "1") {
  console.error(
    `✗ DATABASE_URL points at ${target.hostname}, not this machine. If you mean to change that database, run this again with ALLOW_REMOTE_DATABASE=1 (bun run deploy does).`,
  );
  process.exit(1);
}
console.log(
  `• Migrating ${target.pathname.slice(1) || "(no database name)"} on ${isLocal ? "local Postgres" : "a remote host"}, port ${target.port || "5432 (default)"}, ${isLocal ? "no TLS" : "TLS required"}`,
);

// Connection strings copied from a provider often carry libpq-only settings
// such as `sslmode=verify-full&sslrootcert=system`. The driver would read
// `sslrootcert` as a file to load, so drop them. TLS is configured explicitly
// below instead.
for (const name of [...target.searchParams.keys()]) {
  if (name.startsWith("ssl")) target.searchParams.delete(name);
}

const client = new pg.Client({
  connectionString: target.toString(),
  connectionTimeoutMillis: 15_000,
  // Hosted Postgres only accepts encrypted connections; verify the certificate too.
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: true } }),
});

try {
  await client.connect();
  await migrate(drizzle(client), {
    migrationsFolder: resolve(import.meta.dirname, "../migrations"),
  });
  console.log("• Migrations applied");
} catch (error) {
  // Print what the database said. The driver's errors never include the password.
  const e = error as {
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  console.error("Migration failed.");
  console.error(`  code:    ${e.code ?? e.cause?.code ?? "(none)"}`);
  console.error(`  message: ${e.message ?? String(error)}`);
  if (e.cause?.message) console.error(`  cause:   ${e.cause.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
