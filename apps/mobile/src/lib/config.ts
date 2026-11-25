import { Platform } from 'react-native';

/**
 * Base URL of the Salon Staff server (without `/api/v1`).
 * Android emulators reach the host machine on 10.0.2.2 rather than localhost.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();
export const API_BASE = `${API_URL}/api/v1`;

/** Deep link the identity provider redirects back to when verification finishes. */
export const VERIFY_RETURN_URL = 'salonstaff://verify-complete';

/** Google OAuth client IDs (Google Cloud Console → Credentials). */
export const GOOGLE_CLIENT_IDS = {
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || undefined,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || undefined,
  /** "Web application" client; on Android the ID token is issued for this audience. */
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || undefined,
};

/** Media paths from the API are server-relative (`/media/<key>`). */
export function mediaUrl(path: string): string;
export function mediaUrl(path: string | null | undefined): string | null;
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:|file:)/.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
