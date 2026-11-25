# Runbook: importing the salon directory

Admin portal → **Directory import**. Upload a CSV whose first row is the header:

```
name,suburb,state,postcode,address,phone,email,website,instagram,abn,about
```

Only `name`, `suburb`, `state` (NSW, VIC…) and `postcode` are required. Duplicates (same ABN, or same name + postcode)
are skipped, so re-importing is safe. Up to 5,000 rows per file.

- Only import data we may use: businesses' own published details, the ABR, or data we've licensed. Not scraped Google
  Maps or Seek data.
- `email` must be the business's own published address: claim links go there (D-04).
