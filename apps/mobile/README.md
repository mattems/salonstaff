# Salon Staff — job seeker app (iOS / Android)

Expo SDK 58 + Expo Router app for job seekers on Salon Staff. Every seeker is
identity-verified, so the app is built around sign-in by email code, a profile,
and the Verification centre (identity, right to work, qualifications).

It talks to the API documented in [`docs/api.md`](../../docs/api.md) and shares types,
constants and zod schemas with the web app via `@salonstaff/shared`
(`packages/shared`, resolved through `tsconfig.json` paths + `metro.config.js`).

> This is a standalone npm project (not a root workspace member) with its own `node_modules`.

## Run it

```bash
cd apps/mobile
npm install
cp .env.example .env        # optional, see below
npx expo start              # then press i (iOS simulator) or a (Android emulator)
```

Start the web/API server first (`npm run dev` from the repo root). In local dev the
6-digit sign-in code is printed in the server console and at
`http://localhost:3000/dev/outbox`.

### API URL

`EXPO_PUBLIC_API_URL` is the server origin (without `/api/v1`):

| Where you run the app | Value |
|---|---|
| iOS simulator | `http://localhost:3000` (default) |
| Android emulator | `http://10.0.2.2:3000` (default on Android when unset) |
| Physical device | your computer's LAN address, e.g. `http://192.168.1.20:3000` |

`EXPO_PUBLIC_*` values are inlined at bundle time — restart `expo start` (with `-c`) after changing it.

### Native modules

`expo-secure-store`, `expo-document-picker`, `expo-file-system` and `expo-web-browser` are
Expo SDK modules normally bundled in Expo Go, so Expo Go should work for development. A development build
(`npx expo run:ios` / `npx expo run:android`) is recommended for testing the
`salonstaff://verify-complete` deep link used by identity verification.

## Checks

```bash
npx tsc --noEmit   # typecheck
npx expo lint      # eslint (eslint-config-expo, incl. React Compiler rules)
npx expo export --platform ios --output-dir /tmp/salonstaff-export   # bundle smoke test
```

## Build & release with EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure          # creates eas.json, links the project
npx eas-cli@latest env:create --name EXPO_PUBLIC_API_URL --value https://<api-host> --environment production
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios    # / android
```

Bundle identifier / package: `au.com.salonstaff.app`. Deep-link scheme: `salonstaff`.

## Layout

```
src/
  app/                    Expo Router routes
    _layout.tsx           theme, AuthProvider, Stack.Protected guards
    +native-intent.tsx    handles salonstaff://verify-complete
    (auth)/               sign-in (email) → verify-code (6 digits)
    (app)/                signed-in stack (onboarding nudge lives in _layout)
      (tabs)/             Jobs · Saved · Applications · Profile
      jobs/[id].tsx       job detail (save, apply, "can't apply" CTA)
      apply/[id].tsx      apply modal with optional cover note
      edit-profile.tsx    SeekerProfileInput form (validated with seekerProfileSchema)
      verification.tsx    Verification centre
  components/             small presentational components
  hooks/                  theme, debounce, useRequest
  lib/api.ts              typed fetch client (ApiClientError with status/error/fieldErrors)
  lib/auth.tsx            token in SecureStore, user: Me, refresh(), signOut(); 401 → signed out
  lib/config.ts           API base URL resolution
```
