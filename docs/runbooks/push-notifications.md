# Runbook: push notifications (APNs)

The API sends pushes to Apple itself (D-15). It needs an APNs key; Matt sets it, nothing goes in chat or git.

## 1. The key (once)
1. developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → **+**. Name it "Salon Staff push",
   tick **Apple Push Notifications service (APNs)**, environment **Sandbox & Production**. (One key can
   also have Sign in with Apple; a separate one is easier to rotate.)
2. Download the `.p8` (only once) and note the **Key ID**.
3. The App ID `au.com.salonstaff.app` needs the **Push Notifications** capability. Xcode's automatic signing
   adds it on the next build (the app's entitlements ask for it).

## 2. Secrets
```bash
cd apps/api
bunx wrangler secret put APNS_KEY_ID --env production
bunx wrangler secret put APNS_PRIVATE_KEY --env production   # the .p8 file's contents
```
It also uses `APPLE_TEAM_ID` (a Sign in with Apple secret, [set-up-sign-in.md](set-up-sign-in.md)) and
`APPLE_BUNDLE_ID` (already in `wrangler.jsonc`). Without all four, production sends no pushes; email still goes.

## Locally
Without a key, pushes land in Mailpit as `push+<userId>@local.test`. To get real ones on the simulator (or a
phone running a development build), put the four values in `apps/api/.dev.vars`: development builds use
Apple's sandbox, and the app tells the API which.

To see how the app opens a push, without the API:
```bash
cat > /tmp/push.apns <<'EOF'
{ "aps": { "alert": { "title": "Test salon", "body": "Hello" } }, "body": { "url": "http://localhost:5300/inbox" } }
EOF
xcrun simctl push booted au.com.salonstaff.app /tmp/push.apns
```
Expo Go can't receive this app's pushes: use a development build (`npx expo run:ios`).

## If pushes don't arrive
- The API logs `notification_failed` with Apple's reason (Workers logs).
- `BadDeviceToken` for every push: a sandbox token sent to production or the other way round. TestFlight
  and App Store builds are production; builds from `expo run:ios` are sandbox.
- `InvalidProviderToken`: wrong key ID, team ID or `.p8`.
- Nothing logged: the person has no row in `push_devices` (notifications turned off on the phone, or the app
  not opened since signing in).
