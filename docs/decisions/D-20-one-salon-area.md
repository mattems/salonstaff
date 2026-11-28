# D-20 One salon area for all your salons, and the salon side of the app

**Status:** Accepted (2026-11-28). Builds on D-11 (several salons per account, salon teams).

**Decision.**

- **One salon area, not one per salon.** Jobs, applicants and messages are on one page each, covering
  every salon you're on the team of, with a filter for one salon. Each item says which salon it's for.
  Before, each salon was its own area (`/employer/{salonId}/…`) with a switcher.
- **Posting a job starts with the salon.** "Post a job" asks which of your salons it's for, then shows
  the form at that salon's address and with its team. If only one salon can post, it's chosen for you.
- **A salon keeps its own pages** for what belongs to it: overview (listings, ABN), team, billing and
  details. A job, an application and a profile are still opened through their salon
  (`/employer/{salonId}/jobs/{id}` and so on), because the role that allows an action is per salon.
- **Nothing about teams, roles or billing changes.** Teams and billing stay per salon (D-11, D-05).
  "One business owning salons, with one team and one bill" was considered and not chosen.
- **API.** Three lists across your salons: `GET /v1/employer/jobs`, `/v1/employer/applicants` and
  `/v1/employer/conversations`, each with an optional `salonId` (another salon's ID is a 404). Applicants
  and conversations now carry `salon {id, name}`. `GET /v1/employer/salons` adds each salon's
  `unreadMessages`. Acting on something stays under `/v1/employer/salons/{salonId}/…`, which checks the
  role. In `packages/db` the lists come from the `employerDesk` scope, which only reads the salons the
  person is on the team of.
- **Website.** The salon area has its own frame: shadcn's sidebar (Radix, like every other component
  here), with the public site's header and footer left out.
  - **Hiring:** Overview, Jobs, Applicants, Messages (with the unread count).
  - **Your salons:** each one opens onto its Overview, Team, Billing and Salon details (owners only
    for the last two), plus "Add a salon".
  - **Bottom of the sidebar:** your account menu.
  - **On a phone** it's a sheet behind the menu button.

  The old per-salon addresses for applicants, messages and posting a job redirect, so links in emails
  already sent still work.
- **The app has a salon side.** It's the same app, not a second one. Someone on a salon's team starts
  on the salon side and can switch to the job seeker's side (and back), kept on the phone.
  - **Tabs:** Jobs (live, drafts, ended), Applicants (by status), Messages (with the unread badge) and
    Account.
  - **Hiring tasks:** move an application along, message (with quick replies, live as on the website),
    show their number, read their full profile, and close or relist a job.
  - **On the website instead:** posting and editing jobs, a salon's details, team, billing, and adding
    or claiming salons. The app links there.

  A salon's notices (a new applicant, a reply) open the right screen and switch to the salon side.
- **Notifications have salon topics.** "New applicants" and "Replies from job seekers" each have a push
  and an email switch, shown in the app's Settings on the salon side (the job seeker's three topics
  show on theirs). Before, a reply to a salon went under the job seeker's "Messages from salons", and a
  new applicant couldn't be switched off. A job's own choice of who hears about its applications (D-11)
  still comes first. `PUT /v1/me/notifications` takes the salon topics as optional, so an older app
  saving only the job seeker's three leaves them as they were. Notices about a salon itself (team,
  claims) still always go.

**Why.** Matt didn't like each salon feeling like a separate account. Owners with several locations want
one inbox and one list of applicants, and to pick the salon when they post. On the phone, owners mostly
want to see what's live and reply to people, not set salons up.
