import { Platform } from 'react-native';

/**
 * The API's origin (it serves `/v1/*` and sign-in at `/v1/auth/*`).
 * Locally it's `wrangler dev` on :8890; Android emulators reach the host machine on 10.0.2.2.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (!__DEV__) return 'https://api.salonstaff.com.au';
  return Platform.OS === 'android' ? 'http://10.0.2.2:8890' : 'http://localhost:8890';
}

export const API_URL = resolveApiUrl();

/** The website, for links people open or share (a share page, a salon's page). */
function resolveSiteUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (!__DEV__) return 'https://salonstaff.com.au';
  return Platform.OS === 'android' ? 'http://10.0.2.2:5300' : 'http://localhost:5300';
}

export const SITE_URL = resolveSiteUrl();

/** A page on the website by its path (`/p/k7x2m9qd4h`). */
export const siteUrl = (path: string) => `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

/** Deep link the identity check sends people back to when it finishes. */
export const VERIFY_RETURN_URL = 'salonstaff://verify-complete';

/** Google OAuth client IDs (Google Cloud Console → Credentials). */
export const GOOGLE_CLIENT_IDS = {
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || undefined,
  /** "Web application" client; on Android the ID token is issued for this audience. */
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined,
};

/**
 * Picture URLs from the API are absolute. Locally they point at `localhost`, which an Android
 * emulator or a phone can't reach, so they're moved onto the API address the app uses.
 */
export function mediaUrl(url: string): string;
export function mediaUrl(url: string | null | undefined): string | null;
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (__DEV__) {
    const local = url.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)$/);
    if (local) return `${API_URL}${local[1]}`;
  }
  return url;
}
