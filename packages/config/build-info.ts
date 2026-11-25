/**
 * What a web app build knows about itself: which environment it is for and
 * which commit it was built from. Shown in the corner of every non-production
 * screen, so nobody mistakes staging for the real thing or wonders what is deployed.
 */
import { execSync } from "node:child_process";

/**
 * The commit being built. In CI this is the same tag the deployment carries
 * in the Cloudflare dashboard (scripts/deploy-annotations.sh).
 */
export function buildVersion(): string {
  if (process.env.DEPLOY_TAG) return process.env.DEPLOY_TAG;
  try {
    return execSync("git rev-parse --short=10 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

/** The name to show for a Vite mode, or null for production, which shows nothing. */
export function environmentLabel(mode: string): string | null {
  if (mode === "production") return null;
  if (mode === "development") return "Local";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

/** Compile-time constants for the app (see `EnvironmentBadge` in packages/ui). */
export function buildInfo(mode: string) {
  return {
    __APP_ENVIRONMENT__: JSON.stringify(environmentLabel(mode)),
    __APP_VERSION__: JSON.stringify(buildVersion()),
  };
}
