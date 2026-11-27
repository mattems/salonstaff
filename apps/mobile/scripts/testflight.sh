#!/usr/bin/env bash
# Builds the iOS app on this Mac and uploads it to App Store Connect for TestFlight.
# No Expo account or EAS: Xcode signs and uploads with the Apple account it's signed in to.
# docs/runbooks/testflight.md
#
#   APPLE_TEAM_ID=XXXXXXXXXX npm run testflight              # build and upload
#   APPLE_TEAM_ID=XXXXXXXXXX npm run testflight -- --no-upload  # build the .ipa only
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to your Apple team ID (developer.apple.com → Account → Membership details).}"
destination=upload
[[ "${1:-}" == "--no-upload" ]] && destination=export

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 # CocoaPods needs a UTF-8 locale
export NODE_ENV=production
# Production URLs, over anything in .env (that's for local development). Google client IDs, if
# any, go in .env.production.local.
export EXPO_PUBLIC_API_URL=https://api.salonstaff.com.au
export EXPO_PUBLIC_SITE_URL=https://salonstaff.com.au
# App Store Connect refuses a build number it has seen, so use the time (UTC).
export IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"

out=build/ios
archive="$out/SalonStaff.xcarchive"
rm -rf "$out" && mkdir -p "$out"

# Prebuild rewrites package.json's ios/android scripts; keep ours.
cp package.json "$out/package.json"
trap 'cp "$out/package.json" package.json' EXIT
npx expo prebuild --platform ios --clean --no-install
cp "$out/package.json" package.json
(cd ios && pod install)

echo "Building Salon Staff $(node -p "require('./app.json').expo.version") ($IOS_BUILD_NUMBER)"
xcodebuild archive \
  -workspace ios/SalonStaff.xcworkspace -scheme SalonStaff -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$archive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic

# Never ship a bundle that talks to a local API.
bundle="$archive/Products/Applications/SalonStaff.app/main.jsbundle"
if grep -qaE 'localhost:8890|10\.0\.2\.2' "$bundle" || ! grep -qa 'api.salonstaff.com.au' "$bundle"; then
  echo "The app's bundle doesn't point at the production API; stopping." >&2
  exit 1
fi

cat >"$out/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$destination</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive -archivePath "$archive" -exportPath "$out/export" \
  -exportOptionsPlist "$out/ExportOptions.plist" -allowProvisioningUpdates

if [[ "$destination" == upload ]]; then
  echo "Uploaded build $IOS_BUILD_NUMBER. App Store Connect → TestFlight shows it once it's processed."
else
  echo "Built $out/export/SalonStaff.ipa (not uploaded)."
fi
