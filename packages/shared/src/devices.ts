import { BRAND } from "./brand";

/** A short description of a browser and system from its user-agent string, e.g. "Chrome on macOS". */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  // The mobile app's requests (Expo / React Native) say who they are with their HTTP client.
  if (/okhttp|CFNetwork|Expo/.test(userAgent) && !/Mozilla\//.test(userAgent)) {
    return /okhttp/.test(userAgent) ? `${BRAND.name} app on Android` : `${BRAND.name} app on iOS`;
  }
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\/|FxiOS\//.test(userAgent)
      ? "Firefox"
      : /Chrome\/|CriOS\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X|Macintosh/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /CrOS/.test(userAgent)
            ? "ChromeOS"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}
