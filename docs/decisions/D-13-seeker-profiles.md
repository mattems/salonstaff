# D-13 Job seeker profiles: visibility, sharing, endorsements and contact

**Status:** Accepted (2026-11-26). Contact changed by D-19: "Contact {name}" writes in the salon's conversation with them instead of emailing, number looks show there, and the inbox is their conversations.

**Decision.**

- **Visibility**, chosen by the job seeker:
  - **Public:** salons can find them, and their share link works.
  - **Salons only** (the default): salons can find them; no share link.
  - **Hidden:** only salons they applied to see them.

  A job seeker can also hide from chosen salons (their current boss, say). A hidden salon can't
  see or contact them unless they apply there.
- **Share link:** `/p/{code}`, with 10 random characters (`profilePath` in `urls.ts`). It can't
  be guessed, so profiles can't be scraped by walking IDs or names.
  - It works only while the profile is public. A new code kills the old link.
  - Google doesn't index it (`noindex`).
  - It shows the first name and last initial, and never contact details, pay or verification IDs.
- **Verified tick:** a tick by the name once ID and right to work are both verified. The profile's
  side column lists what was checked: identity, right to work with its basis and how (e.g.
  "Visa, checked with VEVO"), and every qualification with its own tick. Salons also see the
  verification IDs.
  - The preview image is the person's photo.
  - The account page draws a post image (photo, name, headline, link) in the browser to
    download for Instagram and TikTok, which don't take links.
- **Contact** (item 12): only people on an active salon's team, signed in, can contact a job seeker.
  - **"Contact {name}":** a form. We email the message to the job seeker, with reply-to set to
    the sender's address. The job seeker's address is never shown.
  - **"Show number":** reveals their verified mobile.
  - The job seeker chooses which of the two salons get (email, phone, or both).
  - Every message and number reveal is recorded (`profile_contacts`). The job seeker sees them
    in an inbox (`/inbox`, a page of its own), where opening one marks it read. They can reply by email or
    hide that salon from there. A bell in the header shows how many are unread
    (`unreadMessages` on `/v1/me`).
  - Each salon has daily caps (`CONTACT_LIMITS`): 25 messages and 50 number reveals a day, and
    one message to the same person a day.
  - Anyone else (a visitor from a share link) is asked to sign in or list their salon.
- **One mobile:** the number salons see is the account's verified mobile (D-08), changed with an
  SMS code to the new number (as email changes, D-12; the old number is told).
  - The profile's own unchecked `phone` is no longer read or written. Drop it later.
- **Pay:** a minimum and a period (`payMin`, `payPeriod`), in the same shape as jobs, so salons
  can search on it later. The free-text `payExpectation` is no longer read; drop it later.
- **Endorsements** (references):
  - The job seeker asks someone by email.
  - The referee writes it through a one-time link, which proves the address is theirs (30 days).
    They say how they know the job seeker and where they worked together, and whether salons
    the job seeker applies to may contact them.
  - The job seeker can show or hide it but never edit it.
  - Limits: at most 5 shown, one per referee address, never the job seeker's own address, and
    5 requests a day.
  - Marked "On Salon Staff" when the referee's address is on a salon's team here.
  - Referee contact details go only to salons the job seeker applied to, and only if the referee
    agreed.

- **Qualifications are education entries**, one list: the profile's free-text qualifications box
  is gone (migration 0006 turned what was typed there into entries). Each entry is verified on
  its own: the job seeker sends its certificate from the entry, in the Qualifications section or
  on the Verification page, and staff check it (D-03, the certificate deleted on decision).
  - A verified entry has a "Verified" tick wherever the profile shows. Salons also see its
    verification ID; the share page shows only the tick.
  - One check at a time per entry. Removing an entry keeps its check, unlinked, so its ID stays
    valid. The institution is optional.

**Why.** Matt's profile list (2026-11-26), choosing the recommended option for each of visibility,
references, contact and search:
- Job seekers want to share their profile on socials without making every profile scrapable.
- Salons want references they can trust.
- Contact has to be useful to salons but hard to spam, and tracked.

**Not yet:** salons searching and browsing profiles (next), reporting messages to staff, a
Turnstile check on the endorsement form (D-08).
