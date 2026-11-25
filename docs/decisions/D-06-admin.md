# D-06 Admin portal and its protection

**Status:** Accepted (2026-11-25)

**Decision.** The admin portal is its own app on `admin.salonstaff.com.au`, copied from kaybee: Cloudflare Access
(email allow-list, one-time PIN) in front, staff roles (owner, support, readonly) checked by the API, an audit log,
and a staff passkey to confirm dangerous changes (ban, delete, suspend or remove a business, staff changes).
Staff are separate from users. Basic shadcn only.

**Why.** Matt wanted the admin separate from the main site, taken from kaybee, with the passkey step kept.
