/** Drops everything in the local database. Refuses to run against a non-local host. */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run `bun run setup` first.");

const { hostname } = new URL(url);
if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error(`Refusing to reset a database that is not local (${hostname}).`);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("drop schema if exists public cascade");
await client.query("drop schema if exists drizzle cascade");
await client.query("create schema public");
await client.end();
console.log("• Local database emptied");
