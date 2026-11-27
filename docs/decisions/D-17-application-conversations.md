# D-17 Salons and applicants talk in a conversation on the application

**Status:** Accepted (2026-11-27)

**Decision.**

- **One conversation per application** (`application_messages`). Anyone on the salon's team can write;
  the applicant replies once the salon has written (they've already said their piece in the cover
  note). Both sides read and write on the website, and the applicant also in the app. Neither side sees
  the other's email or number through it.
- **Read and unread** per side (`applications.salon_read_at`, `seeker_read_at`): the applicant's Inbox
  badge counts unread messages from salons; the salon's Applicants tab counts applications with unread
  replies.
- **Notifications:** a new message goes to the other side as a push and an email (or a text with no
  email), under the "Messages from salons" topic (D-15): the applicant, or the people the job notifies.
  Replies happen in the conversation, not by email.
- **No daily limit** (since 2026-11-27, with live conversations, D-18): the general rate limit is
  enough. The cold-contact limits of D-13 (one message a day to a person, 25 a day per salon) are for
  people who haven't applied, and don't apply here. A suspended salon can't write; a banned applicant
  drops out.
- **Quick replies** for the salon: invite to an interview, invite to a trial, ask for more, not this
  time (`QUICK_REPLIES`), filled in with the applicant's first name and the job, to edit before sending.
- **Finding applicants:** one Applicants page across all the salon's jobs, and the same on each job's
  page: filter by status (with counts), job, unread replies, verified ID / work rights / qualification,
  open to work, years of experience and name; sort by newest, oldest, experience or latest message. Up to
  200 at a time; filters narrow it.

**Why.** Applying is where a salon and a job seeker most need to talk, and email replies leaked the job
seeker's address and lost the thread. Keeping it on the application keeps the history with the decision.
