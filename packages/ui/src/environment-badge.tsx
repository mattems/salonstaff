import { Badge } from "./components/badge";

declare const __APP_ENVIRONMENT__: string | null;
declare const __APP_VERSION__: string;

/**
 * Says which environment this is and which version is running, in the corner
 * of every screen. Not shown in production. This is the shadcn Badge, placed:
 * it ignores clicks, so it can never get in the way of what is underneath.
 */
export function EnvironmentBadge() {
  if (!__APP_ENVIRONMENT__) return null;
  return (
    <Badge
      variant="outline"
      role="status"
      aria-label={`${__APP_ENVIRONMENT__} environment, version ${__APP_VERSION__}`}
      className="pointer-events-none fixed bottom-2 left-1/2 z-50 -translate-x-1/2 border-warning/30 bg-warning-muted text-warning shadow-sm"
    >
      {__APP_ENVIRONMENT__}
      <span className="font-mono font-normal opacity-80">{__APP_VERSION__}</span>
    </Badge>
  );
}
