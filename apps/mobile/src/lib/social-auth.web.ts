// Browser preview (`expo start --web`): native Google / Apple SDKs aren't available, so the
// sign-in screen uses the dev mock token flow instead (in __DEV__ only).
export type ProviderCredential = { idToken: string; name?: string };

export class ProviderUnavailableError extends Error {}

export async function isAppleAvailable(): Promise<boolean> {
  return false;
}

export async function signInWithApple(): Promise<ProviderCredential | null> {
  throw new ProviderUnavailableError('Sign in with Apple is only available on iOS.');
}

export function isGoogleConfigured(): boolean {
  return false;
}

export async function signInWithGoogle(): Promise<ProviderCredential | null> {
  throw new ProviderUnavailableError('Google sign-in isn’t available in the browser preview.');
}
