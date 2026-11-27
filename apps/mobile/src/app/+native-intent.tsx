import type { NativeIntent } from 'expo-router';

/**
 * The identity provider redirects to `salonstaff://verify-complete`. While the in-app
 * auth session is open it captures that URL itself (and the verification centre
 * re-fetches), so don't also push a route. On a cold start, land on the verification centre.
 * Every other link from outside the app opens its screen, except the two below.
 */
export const redirectSystemPath: NonNullable<NativeIntent['redirectSystemPath']> = ({
  path,
  initial,
}) => {
  try {
    if (path.includes('verify-complete')) return initial ? '/verification' : null;
    // A link from outside can't open a screen that acts on what the link says: the apply screen
    // shows the job title it's given, and the code screen signs in to the address it's given.
    if (/^(?:[a-z][a-z0-9+.-]*:\/\/)?\/*(?:apply|verify-code)(?:[/?#]|$)/i.test(path)) return '/';
    return path;
  } catch {
    return path;
  }
};
