# Runbook: staff passkeys

Staff confirm dangerous changes with a passkey, one tap per change (from uptime). Cloudflare Access is still the sign-in.

## Register one
Open the menu under your name in the admin portal, then **Your passkeys**, then **Add passkey**.
- The first needs nothing more. A later one asks for a passkey you already have.
- Add a second on another device, so losing one doesn't lock you out.

Do this straight after you are added as staff: until you have one, whoever holds your inbox could register theirs. The Staff screen shows who has none.

## Someone lost theirs
An owner opens **Staff**, **Manage** on that person, gives a reason and chooses **Reset passkeys**. It asks for the owner's own passkey. The person then registers again.

## The only owner lost theirs
Nobody in the portal can reset them, so use the script. Locally:
```bash
bun db:staff -- --email you@example.com --reset-passkeys
```
In production, run it with the production connection string, as in [add-a-staff-member.md](add-a-staff-member.md).

## Settings
- `ADMIN_ORIGIN` (in `apps/api/wrangler.jsonc`, not a secret): the admin portal's address. Passkeys belong to its hostname; if it changes, everyone registers again. Without it a deployed API refuses to check passkeys.
- There is no setting to turn confirmation off. Locally (`ENVIRONMENT` is `local`) the portal's prompt has a **Skip (dev only)** button beside **Use passkey**; anywhere else a skip is refused.
