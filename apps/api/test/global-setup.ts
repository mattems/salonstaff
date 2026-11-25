import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { ADMIN_DATABASE_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from "./database-url.ts";

/** Recreates the test database and applies every migration before the tests start. */
export default async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  try {
    await admin.connect();
  } catch (cause) {
    throw new Error(
      "Could not reach Postgres. Start it with `docker compose up -d --wait` (or `bun run setup`).",
      { cause },
    );
  }
  await admin.query(`drop database if exists ${TEST_DATABASE_NAME} with (force)`);
  await admin.query(`create database ${TEST_DATABASE_NAME}`);
  await admin.end();

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await migrate(drizzle(client), {
    migrationsFolder: resolve(import.meta.dirname, "../../../packages/db/migrations"),
  });
  await client.end();
}
