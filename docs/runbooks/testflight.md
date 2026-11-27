# Runbook: the iOS app on TestFlight

Everything builds and uploads on your Mac, with Xcode: no Expo account and no EAS.
`apps/mobile/scripts/testflight.sh` makes the native project (`expo prebuild`), archives it, checks it talks
to the production API, and uploads it to App Store Connect. Xcode signs it with the Apple account it's
signed in to; nothing here goes in chat or git.

## Before the first build
- **Apple Developer Program** membership (Studio 372 Pty Ltd's), and Xcode signed in to that Apple account (Xcode → Settings →
  Accounts). The account needs the Admin or App Manager role.
- Xcode, CocoaPods (`brew install cocoapods`) and the mobile app's packages (`npm install` in `apps/mobile`).
- **The production API is live** at `https://api.salonstaff.com.au` ([first-deploy.md](first-deploy.md)). The
  build only talks to production; until it's deployed the app can't load anything or sign anyone in.

## 1. The app in App Store Connect (once)
1. developer.apple.com → Identifiers: the App ID `au.com.salonstaff.app` with **Sign in with Apple** (also
   step 1 of [set-up-sign-in.md](set-up-sign-in.md)).
2. App Store Connect → Apps → **+ New App**: iOS, name "Salon Staff", bundle ID `au.com.salonstaff.app`,
   any SKU (e.g. `salonstaff`).
3. The app belongs to **Studio 372 Pty Ltd**'s Apple team (`N2TR84P2TD`, `ios.appleTeamId` in
   `app.json`); `bun run ios:device` signs with it too. Xcode must be signed in to an account on it.

## 2. Build and upload
```bash
cd apps/mobile
npm run testflight
```
It takes 10–20 minutes. Xcode makes the signing certificate and profile itself the first time
(`-allowProvisioningUpdates`). The build number is the time in UTC (e.g. `202611271530`), so every run is
new; change `version` in `app.json` for a new release number. `-- --no-upload` builds the `.ipa` in
`apps/mobile/build/ios/export` without uploading it.

App Store Connect processes the build for 10–30 minutes. Export compliance is already answered
(`usesNonExemptEncryption: false` in `app.json`).

### Or from Xcode, as with a Swift app
`expo prebuild` makes an ordinary Xcode project, so you can also release from Xcode's menus:
```bash
cd apps/mobile
NODE_ENV=production EXPO_PUBLIC_API_URL=https://api.salonstaff.com.au \
  EXPO_PUBLIC_SITE_URL=https://salonstaff.com.au IOS_BUILD_NUMBER=$(date -u +%Y%m%d%H%M) \
  npx expo prebuild --platform ios --clean
xed ios
```
Then pick your team under Signing & Capabilities, choose **Any iOS Device**, Product → **Archive**, and
**Distribute App** → App Store Connect in the Organizer. Archive from a terminal with the same
`EXPO_PUBLIC_*` values (`open ios/SalonStaff.xcworkspace` from it), or the bundle may pick up `.env`'s local
URLs. The script checks for that; Xcode doesn't. Put back `package.json`'s `ios`/`android` scripts if
prebuild changes them.

## 3. Testers
App Store Connect → the app → **TestFlight**:
- **Internal testing:** add people from your App Store Connect team to an internal group. No review; they get
  every build once it's processed. Testers install the TestFlight app and accept the invite.
- **External testing** (anyone, by email or public link) needs Beta App Review of the first build, test notes,
  and an account the reviewer can sign in with. Leave it until the app is ready for outsiders.

## Sign-in in a TestFlight build
- **Email and SMS codes** work once production has Resend ([resend.md](resend.md)) and Twilio
  ([twilio.md](twilio.md)).
- **Apple** needs the Apple secrets ([set-up-sign-in.md](set-up-sign-in.md)). `APPLE_BUNDLE_ID` is already in
  `apps/api/wrangler.jsonc`: the app's Apple tokens carry the bundle ID as their audience.
- **Google** stays hidden until the build has its client IDs. Make an iOS OAuth client in Google Cloud and put
  both IDs in `apps/mobile/.env.production.local` (git ignores it):
  ```
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<the API's GOOGLE_CLIENT_ID>
  ```
  The web client ID must be the API's `GOOGLE_CLIENT_ID`: the app's Google tokens are issued for it.
- **Push notifications** need the APNs key ([push-notifications.md](push-notifications.md)). TestFlight builds
  use Apple's production push service.
- The demo login and the other local stand-ins aren't in release builds.

## If it fails
- **No account / no team:** sign in to Xcode (Settings → Accounts) with an account on Studio 372's
  team.
- **"No suitable application records were found":** the app isn't in App Store Connect yet (step 1).
- **"The app's bundle doesn't point at the production API":** the script stops rather than upload a build that
  talks to a local API. Check nothing sets `EXPO_PUBLIC_API_URL` over the script's value.
