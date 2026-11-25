import type { NativeIntent } from 'expo-router';

/**
 * The identity provider redirects to `salonstaff://verify-complete`. While the in-app
 * auth session is open it captures that URL itself (and the verification centre
 * re-fetches), so don't also push a route. On a cold start, land on the verification centre.
 */
export const redirectSystemPath: NonNullable<NativeIntent['redirectSystemPath']> = ({
  path,
  initial,
}) => {
  try {
    if (path.includes('verify-complete')) return initial ? '/verification' : null;
    return path;
  } catch {
    return path;
  }
};
