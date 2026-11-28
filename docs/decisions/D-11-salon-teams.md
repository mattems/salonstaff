# D-11 Several salons per account, and salon teams

**Status:** Accepted (2026-11-25). The website's per-salon area with a switcher is replaced by one
salon area for all your salons (D-20); teams, roles and per-salon billing stay as here.

**Decision.** An account can manage any number of salons (a group's locations, or several claimed
listings), and a salon can have several people: **owners** and **managers**.

- **Who can do what.** Managers post, edit, publish and close jobs and handle applicants and
  candidates. Owners can also change the salon's details and ABN, buy listings, and add, promote or
  remove people. A salon always keeps at least one owner. Anyone can leave a salon themselves, except
  its last owner.
- **Adding people.** An owner invites someone by email, as an owner or a manager: a single-use link
  that lasts 7 days. The person signs in or signs up however they like and accepts. Their account
  becomes an employer account (as claiming does). Owners see pending invites and can cancel them.
- **Claims (D-04).** An account that already manages salons can claim more listings. A listing that
  already has owners can be claimed too, with the same proof (ABN plus the listing's business email
  link, or staff review), for when an owner has left the business. The claimant becomes an owner and the
  existing owners are emailed. Only a listing's first claim gets the launch terms and closes other
  open claims.
- **Application emails.** Each job picks who on the team is told about new applications. A new job
  tells everyone on the team, including people who join later, until someone picks particular people.
- **Billing** stays per salon (D-05). Listing is free until Matt turns paid listings on, and paid
  listings will be charged per job, so a group isn't charged differently from a single salon.
- **API.** `GET/POST /v1/employer/salons` lists your salons (with your role) and creates one (you're
  its owner); everything about one salon is under `/v1/employer/salons/{salonId}/…` (details, jobs,
  applicants, candidates, billing, team). Someone who isn't on the salon gets a 404; a manager doing an
  owner's job gets a 403. The singular `/v1/salon/*` routes are gone (nothing was deployed). The
  website's salon pages are `/employer/{salonId}/…`, with a salon switcher.
- **Data.** `salon_members` (salon, person, role) holds who manages a salon. A listing is claimed when it
  has an owner. `salon_invites` keeps only a hash of the link's token. `jobs.notify_user_ids` is the
  job's chosen people (null: everyone). `salons.owner_id` is no longer read or written; migration 0004
  copied it into `salon_members`, and a later migration drops it.
- **Leaving for good.** When a salon's last owner deletes their account or is deleted by staff, a salon
  they made is deleted, and a claimed listing goes back to being unclaimed, without its team. Staff
  "Detach owner" now detaches the whole team. A salon is hidden while all of its owners are banned.

**Why.** Matt wanted groups with several locations, and owners who claim more than one listing, on one
account; and people who manage a salon to be able to become its owner, so a salon isn't stranded when
someone leaves.
