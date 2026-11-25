import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { pgTestAliases } from "@salonstaff/db/vitest-aliases";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/database-url.ts";

// Tests run inside Cloudflare's local runtime against a real Postgres
// database (`salonstaff_test`) that test/global-setup.ts recreates on every run.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        hyperdrives: { HYPERDRIVE: TEST_DATABASE_URL },
        // A key in .dev.vars, for trying live AI, must never reach the tests: they'd pay for answers.
        // ENVIRONMENT lives in .dev.vars, not wrangler.jsonc: the tests say it themselves.
        bindings: {
          ENVIRONMENT: "local",
          AUTH_SECRET: "test-secret-at-least-32-characters-long",
          IDENTITY_PROVIDER: "mock",
        },
      },
    }),
  ],
  resolve: { alias: pgTestAliases },
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // samlify (the SSO plugin's SAML) imports CommonJS packages by their default export, which
    // only works bundled, as wrangler bundles it for the Worker.
  },
});
