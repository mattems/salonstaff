# Runbook: ABN lookup (Australian Business Register)

1. Register for a free GUID at https://abr.business.gov.au/Tools/WebServices.
2. Locally: add `ABR_GUID=<guid>` to `apps/api/.dev.vars`. Production: `bunx wrangler secret put ABR_GUID --env production`.

With it, an ABN entered by a salon or a claimant is checked live (active, registered name). Without it, ABNs are only
checksum-checked and wait for staff to verify in the admin portal.
