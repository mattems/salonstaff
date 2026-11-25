import { cloudflare } from "@cloudflare/vite-plugin";
import { buildInfo } from "@salonstaff/config/build-info";
import { securityHeaders } from "@salonstaff/config/security-headers";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { MEDIA_ORIGIN } from "./src/lib/site";

/**
 * Headers for the built files Cloudflare serves without running the Worker (scripts, styles,
 * images). Pages rendered by the Worker get theirs, with a per-response nonce, in src/server.ts.
 */
function assetHeaders(mode: string): Plugin {
  return {
    ...securityHeaders({
      images: [mode === "production" ? MEDIA_ORIGIN.production : MEDIA_ORIGIN.local],
    }),
    applyToEnvironment: (environment) => environment.name === "client",
  };
}

export default defineConfig(({ mode }) => ({
  define: buildInfo(mode),
  plugins: [
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    react(),
    assetHeaders(mode),
  ],
  resolve: { tsconfigPaths: true },
  server: { port: 5300, strictPort: true },
  preview: { port: 5300, strictPort: true },
}));
