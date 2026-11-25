/**
 * Writes the API's OpenAPI descriptions to files, without starting a server.
 * The web apps' typed clients are generated from them (`bun run api:types`):
 * the dashboard from the public API, the admin portal from the admin routes.
 */
import { writeFileSync } from "node:fs";
import { createApp, openApiDocument } from "../src/app";

const [publicOut, adminOut] = process.argv.slice(2);
if (!publicOut || !adminOut) {
  throw new Error("Usage: bun scripts/openapi.ts <public output file> <admin output file>");
}

const app = createApp();
for (const [audience, out] of [
  ["public", publicOut],
  ["admin", adminOut],
] as const) {
  writeFileSync(out, `${JSON.stringify(openApiDocument(app, audience), null, 2)}\n`);
  console.log(`Wrote ${out}`);
}
