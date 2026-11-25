# D-07 URLs for search

**Status:** Accepted (2026-11-25)

**Decision.** Readable, stable, lowercase, hyphenated URLs with no IDs:

| Page | URL |
|---|---|
| Job ad | `/jobs/{state}/{suburb}/{title}-{salon}` |
| Jobs by place | `/jobs/{state}`, `/jobs/{state}/{suburb}` |
| Jobs by role | `/jobs/{role}`, `/jobs/{role}/{state}`, `/jobs/{role}/{state}/{suburb}` |
| Salon | `/salons/{state}/{suburb}/{salon}` |
| Directory | `/salons/{state}`, `/salons/{state}/{suburb}` |

State codes and role slugs (`ROLE_SLUGS`) are fixed lists, so the first segment says what a page is. Clashes in a
suburb get `-2`, `-3`. A rename or move writes a 301 redirect. Closed jobs keep their URL (noindex, with similar
jobs). Every page has a canonical tag, a unique title and description, breadcrumbs and JSON-LD (`JobPosting`,
`HairSalon`/`BeautySalon`, `ItemList`). `/sitemap.xml` is generated from the database. Builders and parsers live
in `packages/shared/src/urls.ts` with table tests; nothing else builds public links.

**Why.** Matt: nice URLs for every job and salon listing, to capitalise on SEO and search.
