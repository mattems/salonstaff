import { fileURLToPath } from "node:url";
import { buildInfo } from "@salonstaff/config/build-info";
import { securityHeaders } from "@salonstaff/config/security-headers";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Where uploaded pictures (profile photos, logos) are served from. */
const MEDIA_ORIGIN = {
  production: "https://cdn.salonstaff.com.au",
  local: "http://localhost:8890",
};

export default defineConfig(({ mode }) => ({
  define: buildInfo(mode),
  // The admin app only ever calls its own origin (the Worker forwards /api, as the dev server
  // does here), so the API needs no `connect` entry. Certificates under review are fetched
  // through the API and shown from `blob:` addresses.
  plugins: [
    react(),
    tailwindcss(),
    securityHeaders({
      images: [mode === "production" ? MEDIA_ORIGIN.production : MEDIA_ORIGIN.local, "blob:"],
      noindex: true,
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5301,
    strictPort: true,
    // Deployed, the admin Worker forwards /api to the API (worker/index.ts). This does the same locally.
    proxy: {
      "/api": { target: "http://localhost:8890", rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
}));
