import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export { schema };
export type Db = NodePgDatabase<typeof schema>;

/** Counted as a request uses the database, for its Server-Timing header and log line. */
export interface DbTimings {
  queries: number;
}

export interface DbConnection {
  db: Db;
  /** Closes the connection. Call once the request is finished. */
  close: () => Promise<void>;
}

/**
 * Opens a connection. On Cloudflare the connection string comes from
 * Hyperdrive, which pools the real database connections, so a Worker opens
 * a fresh client per request. Locally it points straight at Docker Postgres.
 *
 * The driver is pg, not postgres.js: on a fresh connection postgres.js sends each query
 * with parameters in two round trips (it asks for the parameter types first), pg in one.
 */
export async function connect(
  connectionString: string,
  options: { ssl?: "verify-full"; timings?: DbTimings } = {},
): Promise<DbConnection> {
  const { timings, ssl } = options;
  const client = new pg.Client({
    connectionString,
    ...(ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  });
  // pg emits an error on an idle connection, and an emitted error nobody listens for is
  // thrown. The next query on the connection fails and reports it instead.
  client.on("error", () => {});
  await client.connect();
  const logger = timings
    ? {
        logQuery: () => {
          timings.queries++;
        },
      }
    : false;
  return {
    db: drizzle(client, { schema, logger }),
    close: () => client.end(),
  };
}

/** Cheapest possible round trip, used by the readiness check. */
export async function ping(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}

export * from "./audit";
export * from "./back-office";
export * from "./billing";
export * from "./checks";
export * from "./claims";
export * from "./housekeeping";
export { contains } from "./like";
export * from "./public-site";
export * from "./salon";
export * from "./seeker";
export * from "./staff-office";
export * from "./team";
export type { Job, JobWithSalon, PageOf, Salon } from "./visibility";
export { isClaimed } from "./visibility";
