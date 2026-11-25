import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { GOOGLE_CLIENT_IDS } from '@/lib/config';

/** What a native provider hands back: the ID token for `/auth/oauth`, plus a display name if known. */
export type ProviderCredential = { idToken: string; name?: string };

/** Thrown when the native SDK isn't in this binary (e.g. Expo Go) so callers can fall back. */
export class ProviderUnavailableError extends Error {}

// ---------- Apple (iOS only) ----------

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Resolves `null` if the user cancels. */
export async function signInWithApple(): Promise<ProviderCredential | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error('Apple didn’t return an identity token.');
    // Apple only sends the name on the very first sign-in.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ');
    return { idToken: credential.identityToken, name: name || undefined };
  } catch (err) {
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return null;
    throw err;
  }
}

// ---------- Google (@react-native-google-signin, "Original" API) ----------

/**
 * iOS needs the iOS client ID. Android needs the web client ID (the ID token's audience) and an
 * Android client registered for this package + signing SHA-1 in Google Cloud.
 */
export function isGoogleConfigured(): boolean {
  if (Platform.OS === 'ios') return !!GOOGLE_CLIENT_IDS.ios;
  if (Platform.OS === 'android') return !!(GOOGLE_CLIENT_IDS.web && GOOGLE_CLIENT_IDS.android);
  return false;
}

let googleConfigured = false;

/** Resolves `null` if the user cancels. */
export async function signInWithGoogle(): Promise<ProviderCredential | null> {
  // Loaded lazily: the native module isn't in Expo Go, and importing it eagerly would crash there.
  let lib: typeof import('@react-native-google-signin/google-signin');
  try {
    lib = await import('@react-native-google-signin/google-signin');
  } catch {
    throw new ProviderUnavailableError('Google sign-in needs a development build of the app.');
  }
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = lib;

  if (!googleConfigured) {
    GoogleSignin.configure({
      iosClientId: GOOGLE_CLIENT_IDS.ios,
      webClientId: GOOGLE_CLIENT_IDS.web,
    });
    googleConfigured = true;
  }

  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    const { idToken, user } = response.data;
    if (!idToken) throw new Error('Google didn’t return an ID token. Check the client IDs.');
    return { idToken, name: user.name ?? undefined };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (err.code === statusCodes.IN_PROGRESS) return null;
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play services is unavailable or out of date on this device.');
      }
    }
    throw err;
  }
}
