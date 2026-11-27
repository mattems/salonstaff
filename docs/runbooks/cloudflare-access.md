# Runbook: Cloudflare Access for the admin portal

The admin portal is behind Cloudflare Access: before anyone sees it, Cloudflare asks for their email address and sends a one-time PIN. Only addresses on the allow-list get a PIN. This is free for up to 50 people and needs no Google Workspace or other identity provider.

Access must be in place **before the first deploy of the admin portal**, so the hostname is never reachable without it.

Labels in the Cloudflare dashboard change from time to time; the names below may differ slightly.

## One time: turn on Zero Trust
1. Cloudflare dashboard, your account → **Zero Trust**.
2. Choose a team name, e.g. `salonstaff`, giving the team domain `salonstaff.cloudflareaccess.com`.
3. Choose the **Free** plan. It may ask for a payment method even though the price is $0.
4. **Settings → Authentication → Login methods:** check that **One-time PIN** is listed. It is there by default.

## Per environment: protect the hostname
1. **Access → Applications → Add an application → Self-hosted.**
2. Name: `Admin`. Session duration: 24 hours.
3. Add a public hostname: `admin.salonstaff.com.au`. The hostname does not need to exist yet.
4. Add a policy. Name: `Staff`. Action: **Allow**. Include: **Emails**, then each staff member's address.
5. Save.
6. Open the application again and copy its **Application Audience (AUD) tag**.

## Tell the API
The API checks every admin request against two values. Neither is a secret. They go in `apps/api/wrangler.jsonc`, under `env.production.vars`:

```jsonc
"ACCESS_TEAM_DOMAIN": "salonstaff.cloudflareaccess.com",
"ACCESS_AUD": "<the AUD tag>"
```

Until both are set, the admin API refuses every request.

## Check it works
1. Open the admin hostname in a private window. You should see Cloudflare's "enter your email" page, not the portal.
2. Enter an allowed address, then the PIN from the email.
3. If the address is on the Staff list, the portal opens. Otherwise it says why not.

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://admin.salonstaff.com.au/
```

That should print `302` and an address on the team domain.

## Day to day
- **Let someone in or remove them:** edit the policy's email list. Then add or remove them as staff: [add-a-staff-member.md](add-a-staff-member.md).
- **Sign someone out everywhere:** Zero Trust → the application → revoke their session.
  That stops the portal, but a token they already hold keeps working if sent straight to the API
  until it expires. To cut someone off at once, remove them on the portal's Staff screen (or
  `bun db:staff`): the API checks the staff list on every request.
- **Changed the application or team name?** The AUD tag or team domain changes with it. Update `wrangler.jsonc`.

## If the portal says…
| Message | Meaning |
|---|---|
| "This request did not come through Cloudflare Access" | The hostname isn't behind Access, or you called the API directly. |
| "The Cloudflare Access token is not valid for the admin portal" | `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` doesn't match the application. |
| "…@… is not staff" | Their address passed Cloudflare Access but has no staff record. Add them on the portal's Staff screen: [add-a-staff-member.md](add-a-staff-member.md). The address must match exactly what they typed for the PIN. |
| A plain "Something went wrong" on every admin request | The two values above are missing. The API's log says so. |
