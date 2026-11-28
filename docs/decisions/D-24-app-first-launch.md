# D-24 The app's first launch: welcome, who you are, mobile sign-up

**Status:** Accepted (2026-11-28). Being built in steps; see "Steps" below.

**Decision.** What someone sees in the app before they have an account. Job seekers come first; the
salon side's own sign-up comes later.

- **Sign up first.** Nothing in the app is shown without an account (as before). If App Store review
  objects, the fix is a "Look around" link to jobs.
- **Welcome screen.** Anyone signed out starts here (`/welcome`):
  - a muted, looping video of salon work fills the screen and fades to black behind the text;
  - three short slides swipe across over it, with dots, and the video carries on underneath;
  - **Get started** is on every slide, with "Already have an account? Sign in" under it.

  The video is in the app, so it plays at once. A still of its first frame shows until it plays, and
  instead of it when Reduce Motion is on. It plays only while the screen is in front, and doesn't stop
  other audio.
- **Who you are.** "Get started" asks "What brings you to Salon Staff?":
  - **Looking for work** goes on to sign up with a mobile number.
  - **Hiring for a salon** says salons are set up on the website (D-20), with a link there, and "sign
    in" for people already on a salon's team.

  Signing in doesn't ask: the account already knows which side it's on.
- **New job seekers sign up with an Australian mobile only** (the first half of D-08). Email, Apple and
  Google stay, under "Other ways to sign in", for accounts that already use them.
  - One screen for both, with +61 already there: "What's your mobile number?" when signing up,
    "Welcome back" when signing in, each with a link to the other. The code screen is the same as
    before, plus "Wrong number? Change it".
  - Only the app's screens steer new people to the mobile: the API still makes an account for a new
    email, Apple or Google sign-in, as before. Enforcing it there is part of building D-08.
- **Setting up after the code** (new accounts only), one question per screen with progress bars:
  1. name;
  2. roles (up to 6, grouped hair, beauty and salon) and years of experience;
  3. suburb and postcode (the state follows the postcode, `stateOfPostcode`), and how far they'd
     travel (optional);
  4. work rights;
  5. photo (can be skipped);
  6. notifications;
  7. the Face ID offer (D-21).

  Then "You're in": how complete their profile is, the next few things to add, and **Finish my
  profile** (to Profile) above "Look at jobs". The ID check, if it stays, is asked for at their first
  application.

  - **When it saves.** The answers are kept on the phone until work rights, the last thing a profile
    needs; continuing saves the profile (and the travel distance). Photo, notifications and Face ID
    are each skippable.
  - **Only where the phone can.** Notifications show where pushes work, and Face ID where the phone
    has it set up.
  - **Can't be dismissed.** It's a full-screen sheet that can't be swiped away. A new account with no
    profile opens it again next time.
  - **Prompts held back.** iOS's notification prompt waits for step 6, and the Face ID pop-up after a
    code sign-in isn't shown to a new job seeker, who gets step 7 instead.
  - **"Not now" to notifications sticks.** The app doesn't ask by itself again; Settings still can.
  - **Replaces the old onboarding.** The long Edit profile form no longer has an onboarding mode.

- **The focus after that is a complete, current profile.**
  - **One score.** `profileStrength` in `rules.ts` is used by both the website's meter and the app. It
    adds up to 100: basics 20, three portfolio photos 15, a photo 10, headline and about 10,
    specialties 10, experience 10, a verified ID 10, availability 5, pay 5, an endorsement 5.
  - **Profile tab.** It opens with the score, the most valuable thing to add as a button, and the rest
    as rows with what each adds. At 100% it's one line.
  - **Nudges.** While the score is under 70%, Jobs shows a slim "Your profile is N% complete" bar.
    Applying says what the salon will see missing, without stopping them.
  - **Last updated.** The profile's `updatedAt` (in the API) moves when any part of it changes,
    portfolio, experience and qualifications included, or when they say it's still current
    (`POST /v1/me/profile/current`, audited as `profile.confirmed_current`).
  - **The 90-day check.** After 90 days without a change (`profileIsStale`), Profile asks "Still
    looking?", with "Yes, it's current" and "Update it". Reminders by push or email may come later.

**Steps.**

| Step | State |
|---|---|
| Welcome screen and "who you are" | Built |
| Sign-up and sign-in screen that's mobile-first | Built |
| Setting up after the code | Built |
| Profile strength, nudges and the 90-day check | Built. Reminders by push or email: later |
| The real video | For now Matt's watermarked Envato preview (`docs/media/`), cropped to portrait; swap in the licensed file before release |
| A salon sign-up in the app | Later |

**The video.** Portrait, 8–15 seconds, looping without a visible join, no text in it, under about 4 MB,
and licensed for use in an app. Replace `apps/mobile/assets/video/welcome.mp4` and its poster
`welcome-poster.jpg` (the first frame). A landscape clip is cropped to portrait around the people
(from a 960×540 clip: `crop=304:540:353:0`), then the poster taken from it:

```bash
ffmpeg -i welcome.mp4 -frames:v 1 -q:v 4 welcome-poster.jpg
```

**Why.** Matt wants job seekers to use the app, with a first screen that sells it (a video of
hairdressers at work), and to keep salon owners out of the job seeker's sign-up. A mobile number at
sign-up is also what D-08 needs to keep out applicants who aren't in Australia.
