import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * For Worker tests (vitest-pool-workers). pg is CommonJS and requires two packages that the test
 * runtime resolves wrongly: pg-protocol to its ES module build, which require can't load, and
 * pg-cloudflare to an empty stub, because the `workerd` condition isn't applied. Wrangler's
 * bundle for a deployed Worker resolves both correctly.
 */
const fromPg = createRequire(createRequire(import.meta.url).resolve("pg"));

export const pgTestAliases = {
  "pg-protocol": fromPg.resolve("pg-protocol"),
  "pg-cloudflare": join(dirname(fromPg.resolve("pg-cloudflare/package.json")), "dist/index.js"),
};
