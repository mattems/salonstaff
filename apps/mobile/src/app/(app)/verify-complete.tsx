import { Redirect } from 'expo-router';

/**
 * Target of the `salonstaff://verify-complete` deep link. On iOS the auth session
 * captures it; on Android it can open the app directly, so send people back to the
 * verification centre, which re-fetches status on focus.
 */
export default function VerifyComplete() {
  return <Redirect href="/verification" />;
}
