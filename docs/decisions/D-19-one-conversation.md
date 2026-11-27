# D-19 One conversation between a salon and a job seeker

**Status:** Accepted (2026-11-27). Replaces D-13's emailed messages and D-17's conversation per application.

**Decision.**

- **One conversation per salon and job seeker** (`conversations`, unique on both), however it started:
  from an application, or from their profile. Its messages (`conversation_messages`) can say which
  application they're about (`application_id`). The conversation shows that above the message, and lists
  the person's applications to the salon at the top.
- **Starting one is the salon's job:**
  - on an application: any time;
  - from a profile: when D-13 lets the salon message them (visible to the salon, not hidden from it,
    and "Messages" in how they take contact).

  A job seeker replies once the salon has written, as in D-17. They still can't message a salon cold;
  they apply.
- **"Contact {name}" writes in the conversation.** It no longer emails the message with the sender's
  address as reply-to. The job seeker is told by push and email under "Messages from salons" (D-15),
  and replies on Salon Staff. Neither side sees the other's email.
- **"Show number" stays**, as a call isn't a message. Each look (at most one a day per person) also
  appears in the conversation as a line ("Looked at your number"), so salons' contact is all in one
  place.
- **Limits** (`contactLimitReached`) only where it's cold, when the person hasn't applied to the salon
  and hasn't replied:
  - 25 new conversations a day per salon;
  - one message a day to that person.

  Once they've applied or replied there's no limit (D-17), and 50 number looks a day per salon still
  apply.
- **One place to read and write it** on each side:
  - the job seeker's **Inbox**, on the website and in the app: their conversations, newest first,
    with one unread count (the header bell and the app's Inbox badge);
  - the salon's **Messages** page, with the unread count on its tab.

  Applications, profiles and applicant lists don't show the messages; they link to the conversation
  ("Messages", with how many are new).
- **Live per conversation** (D-18): the `ConversationRoom` is keyed by the conversation, not the
  application.
- **How they take contact** (`contactBy`, D-13): `email` now reads as "Messages". Messages no longer
  need an email address, as the job seeker can read them in the app.

**Moving over.** Migration 0011 copies each application's messages into the conversation for that salon
and job seeker, and each emailed profile message and number look into theirs. `application_messages`,
the `applications` read columns and `profile_contacts.message` stay until the code that used them is
gone everywhere, then a later migration drops them. Number looks keep being recorded in
`profile_contacts` for the daily limit.

**Why.** Salons reached job seekers in two places: emailed messages answered outside Salon Staff, and
in-app conversations on applications. The same two people could end up talking in both, and someone who
applied for two jobs at one salon had two threads with the same team. One thread per pair matches how
people think about it ("my chat with Willow & Ash"), keeps everyone's address private, and gives one inbox.
