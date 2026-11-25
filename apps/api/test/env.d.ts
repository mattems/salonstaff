import type { Env as AppBindings } from "../src/env";

// Types the `env` object that `cloudflare:test` hands to tests.
declare global {
  namespace Cloudflare {
    interface Env extends AppBindings {}
  }
}
