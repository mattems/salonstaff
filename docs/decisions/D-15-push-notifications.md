# D-15 Push notifications, straight from the API to Apple

**Status:** Accepted (2026-11-27)

**Decision.**

- **What's pushed:** the same notices the API already emails: a salon's message, an update on an
  application, a verification decided, an endorsement written, and the salon notices (a new applicant, a
  claim decided). Email still goes too. `notify()` sends both; a salon's message pushes even to someone
  with no email. An account with no email (made with a mobile) gets a topic's notices by push only, and
  its email switches are off in the app (D-24); only notices that always go (a salon's team, a claim)
  come by text instead.
- **Delivery:** the API sends to Apple's push service (APNs) itself, with an APNs key and a JWT (as for Sign in
  with Apple). No Expo push service or Firebase: like the builds (D-14), nothing else in the chain.
  Locally, without a key, pushes go to Mailpit as `push+<userId>@local.test`.
- **Devices:** `push_devices`, one row per signed-in app session (`PUT /v1/me/push-device`, sent on every
  launch). It's deleted with its session, so signing out, "sign out everywhere else" and expiry all stop the
  pushes. A token Apple calls gone is forgotten; a token another account registers moves to it.
- **Opening one:** a push carries the website link its email has. The app opens its own screen for it
  (`/inbox`, `/applications`, `/account/verify`, `/account/endorsements`), or the website for the rest.
- **Choosing:** for each topic (messages from salons, your applications, verification and
  endorsements) a push switch and an email switch, saved on the account (`notification_preferences`,
  `GET`/`PUT /v1/me/notifications`; no row means on). Email covers the text sent instead when there's no
  email. Sign-in, security and salons' own notices have no topic and always go. The app's Settings has
  the switches; the website can show the same later. A salon's team has its own topics, new applicants
  and replies from job seekers (D-20), shown on the app's salon side.
- **Asking:** the app asks permission once the person has a profile (not during onboarding), and Settings
  offers it again or links to the phone's settings when it's off.
- iOS only for now. Android, later, sends through Firebase Cloud Messaging the same way.

**Why.** Job seekers need to hear from a salon fast, and phones read push before email. Sending direct keeps
it to the API and Apple, and the session link means a signed-out phone never gets someone's notices.
