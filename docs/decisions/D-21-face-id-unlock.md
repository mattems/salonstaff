# D-21 Face ID to open the app

**Status:** Accepted (2026-11-28).

**Decision.** The app can ask for Face ID, Touch ID or a fingerprint (falling back to the phone's
passcode) before it shows anything. It's a lock on this phone over the session the app already keeps
in the Keychain/Keystore (D-02's bearer token). It isn't a new way to sign in to the account.

- **Turning it on.** After signing in with a code, the app offers it once ("Use Face ID to open Salon
  Staff?"). It's also a switch in Settings, shown only when the phone has biometrics set up. Turning it
  on asks for Face ID first, so it's known to work.
- **When it asks.** When the app opens with a saved session, and when it comes back after more than
  five minutes in the background (`LOCK_AFTER_MS`). The app stays as it was underneath, so unlocking
  carries on where you left off.
- **Locked out.** "Sign in another way" signs out on this phone, then it's a code as usual.
- **Kept on the phone** (`expo-local-authentication`, the choice in SecureStore). Signing out forgets it,
  and the next sign-in offers it again. Nothing changes on the server, and the session's lifetime is as
  before.
- **Not chosen now: passkeys.** Signing in with Face ID on a new phone or on the website would mean
  passkeys: Better Auth's passkey plugin and a migration, a file on salonstaff.com.au linking the domain
  to the app, and a native passkey module. It can only be tried properly once the site is deployed.

**Why.** Matt wanted Face ID or biometric login in the app. People stay signed in on their phone, so
the useful part is keeping the account private on a shared or borrowed phone without typing a code
each time. That needs no server change and works in the current builds.
