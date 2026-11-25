# Runbook: email (Resend)

1. Resend → Domains → add `salonstaff.com.au`; add the DNS records it shows in Cloudflare; wait for "Verified".
2. API key with sending access → `bunx wrangler secret put RESEND_API_KEY --env production` (in `apps/api`).
3. Sender: `EMAIL_FROM` in `apps/api/wrangler.jsonc` (`Salon Staff <hello@salonstaff.com.au>`).

Locally every email goes to Mailpit (http://localhost:8036); no key needed.
