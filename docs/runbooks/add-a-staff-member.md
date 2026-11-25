# Runbook: add or remove a staff member

Opening the admin portal takes two things: an address on the Cloudflare Access list, and a staff record with that same address. Staff need **no customer account**: passing Cloudflare Access is the sign-in (conventions: Staff). This covers the staff record. For the Access list, see [cloudflare-access.md](cloudflare-access.md).

Someone on only one of the two lists can't get in.

## Roles
| Role | Can |
|---|---|
| `owner` | Everything, including staff and deleting people or businesses |
| `support` | Review checks and claims, flag and ban people, moderate salons and jobs, give credits, import the directory |
| `readonly` | View only |

The exact permissions are in `packages/shared/src/staff.ts`.

## Day to day: the Staff screen
An owner opens **Staff** in the admin portal.
- **Add staff member:** name, email, role and a reason. They are staff at once. No email is sent, so tell them. Then add the same address to the Access list in Cloudflare.
- **Manage:** change a role or remove someone, with a reason. Removal takes effect on their next click. Then remove their address from the Access list too.
- **Tell a new staff member to register a passkey at once** ([staff-passkeys.md](staff-passkeys.md)). Manage also resets someone's lost passkeys.
- You can't remove yourself or change your own role, and the last owner can't be removed or made anything else.

## The first owner of a fresh environment: the script
Nobody can open the portal until one owner exists, so the first is added with a script.

Locally:
```bash
bun db:staff -- --email you@example.com --name "Your Name" --role owner
```

In production, run it directly with the production database connection string. The `app` role is enough. Enter the connection string yourself, in your own terminal, so it stays out of your shell history:
```bash
cd packages/db
```
```bash
read -s "DATABASE_URL?Connection string: " && export DATABASE_URL
```
```bash
bun scripts/staff.ts --email you@example.com --name "Your Name" --role owner
```

The script can also change a role (run it again with a different `--role`), remove someone (`--email someone@example.com --remove`) and list staff (`--list`).

## Locally
There is no Cloudflare Access on a laptop. The portal (`localhost:5301`) asks which staff member you are, from the local staff list, and remembers it in that browser. "Switch staff member" is in the menu at the bottom of the sidebar.

## Audit
Every change is recorded in the audit log (`staff.added`, `staff.role_changed`, `staff.removed`) with the reason. The actor is the staff member who made it, or System when it came from the script.
