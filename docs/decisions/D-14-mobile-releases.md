# D-14 Mobile releases are built on Matt's Mac

**Status:** Accepted (2026-11-27)

**Decision.** The app stays an Expo app for development (`expo start`, Expo Go), but release builds are made
and uploaded locally with Xcode, as for a Swift app: `expo prebuild` writes the native project, Xcode
archives, signs and uploads it to App Store Connect. No Expo account, EAS Build or EAS Submit.
`apps/mobile/scripts/testflight.sh` does it in one command (docs/runbooks/testflight.md).

**Why.** Builds, signing keys and uploads stay on Matt's machine and his Apple account, with no other
service or account in the chain.

**Consequences.**
- The native project (`ios/`) is generated and git-ignored: never edit it by hand; change `app.json`,
  `app.config.js` or a config plugin and build again.
- No over-the-air updates (EAS Update): every change, JS included, ships as a new build.
- The build number is the UTC time, set at build time, so builds never repeat one.
- Android, when it comes, is the same: a local Gradle build uploaded to Google Play.
