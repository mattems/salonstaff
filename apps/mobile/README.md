# Salon Staff — the app (iOS / Android)

Expo SDK 58 + Expo Router app for job seekers on Salon Staff. Every seeker is
identity-verified, so the app is built around sign-in by email code, a profile,
and the Verification centre (identity, right to work, qualifications).

It also has a **salon side** (D-20) for anyone on a salon's team: their salons' jobs, applicants and
messages, and the hiring tasks (status, messages, number, profile, close or relist a job). Salon owners
start there and can switch sides from Account (salon side) or Profile (job seeker's side); the choice is
kept on the phone (`lib/mode.tsx`). Posting jobs and setting salons up stay on the website. Locally, sign
in with "Demo salon owner" (owner1, who owns two salons).

It talks to the API's `/v1` (reference: http://localhost:8890/docs locally) with types generated
from its OpenAPI description, and shares constants and zod schemas with the website via `@salonstaff/shared`
(`packages/shared`, resolved through `tsconfig.json` paths + `metro.config.js`).

> This is a standalone npm project (not a root workspace member) with its own `node_modules`.

## Run it

Start the API first: `bun dev` from the repo root (the API is `wrangler dev` on :8890). Then:

```bash
cd apps/mobile
npm install
npx expo start --ios          # installs Expo Go on the simulator and opens the app
```

Signed out, the app opens on the welcome screen (D-24); **Sign in** leads to the sign-in screen, which
locally has **Demo job seeker** and **Demo salon owner** buttons (the API's dev login, local only).
Email codes land in Mailpit (linked from the springboard, http://localhost:4100); SMS codes too.

### On your phone

With `bun dev` running, in another terminal at the repo root, either:

```bash
bun run ios:device
```

A development build installed on your iPhone, as in the other apps (`expo run:ios --device`),
with push notifications and Sign in with Apple. It's signed with Studio 372 Pty Ltd's Apple team
(`ios.appleTeamId` in `app.json`), so Xcode must be signed in to an Apple account on that team
(Xcode → Settings → Accounts). Plug the phone in (or pair it in Xcode) and unlock it. The first time, turn on Developer Mode on the
phone (Settings → Privacy & Security) and pick it from the list. Run it again whenever you want to
use the app: later builds only redo what changed.

If it fails with `Provisioning Profile "iOS Team Provisioning Profile: *" does not support the Push
Notifications capability` (the first time, or with a new phone): the team's App ID and profile for
`au.com.salonstaff.app` aren't set up yet, and `expo run:ios` doesn't let Xcode make them when the
team is set in `app.json`. Open the project once in Xcode (`xed apps/mobile/ios`), select the
SalonStaff target → Signing & Capabilities, keep automatic signing with Studio 372 Pty Ltd, wait for
Xcode to fix the profile, then run `bun run ios:device` again.

```bash
bun run phone
```

Expo Go instead: scan the QR code with the Camera (install Expo Go from the App Store first). No
build, but no push notifications or Google sign-in.

Both open the local API and site to your Wi-Fi on :8891 and :8892 while they run, and point the
app at them; Ctrl-C closes them again. The phone must be on the same Wi-Fi as the Mac. Anyone on
that Wi-Fi can reach the local API meanwhile, dev login included, so use it on a network you
trust. The first time, macOS may ask whether `bun` can accept incoming connections: allow it.
Sign in with the demo job seeker, or an email code from Mailpit on the Mac (http://localhost:8036).

### API URL

`EXPO_PUBLIC_API_URL` is the API's origin (it serves `/v1/*`):

| Where you run the app | Value |
|---|---|
| iOS simulator | `http://localhost:8890` (default in development) |
| Android emulator | `http://10.0.2.2:8890` (default on Android in development) |
| Your phone | set for you by `bun run phone` (below) |
| Release build | `https://api.salonstaff.com.au` (default when not in development) |

`EXPO_PUBLIC_SITE_URL` is the website, for share links and salon pages: `http://localhost:5300`
in development (`10.0.2.2` on Android), `https://salonstaff.com.au` in release builds.

`EXPO_PUBLIC_*` values are inlined at bundle time: restart `expo start` (with `-c`) after changing it.

### How it talks to the API

- Types come from the API's OpenAPI description: `bun run api:types` at the repo root writes
  `src/lib/api/schema.d.ts`. Run it after any API change, then `npx tsc --noEmit` here.
- Sign-in is Better Auth at `/v1/auth/*` (email code, SMS code, Google/Apple ID tokens). The
  session token comes back in the `set-auth-token` header and is sent as `Authorization: Bearer`;
  it's kept in SecureStore. Cookies are never sent.
- Google and Apple appear only when the build can use them (Apple on iOS; Google needs
  `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` and a development build). The API needs the matching client IDs.

### Native modules

`expo-secure-store`, `expo-document-picker`, `expo-file-system` and `expo-web-browser` are in
Expo Go. A development build (`npm run ios` / `npm run android` here, or `bun run ios:device` at the
root for your phone) is needed for Google
sign-in and recommended for the `salonstaff://verify-complete` deep link used by the ID check.
Push notifications also need one: Expo Go can't receive this app's pushes
([docs/runbooks/push-notifications.md](../../docs/runbooks/push-notifications.md)).

## Checks

```bash
npx tsc --noEmit   # typecheck
npx expo lint      # eslint (eslint-config-expo, incl. React Compiler rules)
npx expo export --platform ios --output-dir /tmp/salonstaff-export   # bundle smoke test
```

## Build & release

Releases are built on your Mac with Xcode, not on EAS. To put the iOS app on TestFlight, follow
[docs/runbooks/testflight.md](../../docs/runbooks/testflight.md):

```bash
npm run testflight
```

Bundle identifier / package: `au.com.salonstaff.app`. Deep-link scheme: `salonstaff`.

## Layout

```
src/
  app/                    Expo Router routes
    _layout.tsx           theme, AuthProvider, Stack.Protected guards
    +native-intent.tsx    handles salonstaff://verify-complete
    (auth)/               welcome (video, slides) → who (job seeker or salon; for-salons) →
                          sign-in (sign up or sign in: mobile, or other ways) → verify-code (6 digits)
    (app)/                signed-in stack (sends new job seekers to setup, pushes, Inbox badge refresh in _layout)
      setup/              setting up a new job seeker, one question per screen (D-24)
      (tabs)/             native tab bar, each tab a group with its own stack for the title bar:
                          job seeker: (jobs) · (saved) · (applications) · (inbox) · (profile);
                          salon side: (hiring) · (applicants) · (messages) · (salon), the other
                          side's tabs `hidden`
      hire/               the salon side's screens: job/[salonId]/[id], application/[salonId]/[id],
                          candidate/[salonId]/[userId], conversation/[salonId]/[userId]
      jobs/[id].tsx       job detail by path (save, apply, the API's `blocker` as the next step)
      apply/[id].tsx      apply modal with optional cover note
      edit-profile.tsx    SeekerProfileInput form (validated with seekerProfileSchema)
      profile/            the website's account sections: photo, skills, availability, portfolio,
                          experience, endorsements, sharing, contact, security
      inbox/[id].tsx      one message or number view (the list is the Inbox tab)
      applications/[id]   an application and the conversation with the salon (D-17)
      settings.tsx        notifications, appearance, version, developer details
      verification.tsx    Verification centre (ID, right to work, a certificate per qualification)
  components/             small presentational components
  hooks/                  theme, debounce, useRequest
  lib/api.ts              typed client (openapi-fetch) + Better Auth sign-in; ApiProblem errors
  lib/api/schema.d.ts     generated by `bun run api:types`, never edited by hand
  lib/auth.tsx            token in SecureStore, user: Me, refresh(), signOut(); 401 → signed out
  lib/mode.tsx            which side shows (job seeker or salon), your salons and their unread count
  lib/biometric-lock.tsx  Face ID / Touch ID / fingerprint to open the app (D-21), the lock screen
  lib/config.ts           API URL, picture URLs
```
