# D-10 "Near me" search

**Status:** Accepted (2026-11-25)

**Decision.** Job seekers can search jobs, and the salon directory (with "Hiring now"), within 5, 10, 25,
50 or 100km of where they are, nearest first, each result showing its distance.

- **Where they are:** the browser's location ("Use my location"), rounded to 2 decimal places (about 1km)
  before it goes in the address, or a postcode when they'd rather not share it. Never stored.
- **Where salons and jobs are:** the centre of their suburb (ABS Suburbs and Localities 2021, CC BY 4.0),
  matched on state and suburb slug, preferring the one in the same postcode since names repeat; else the
  centre of the postcode (ABS Postal Areas). Not their street address: no geocoding service, and it's the
  same for owner-made salons and imported ones. About ±2km in cities, enough for these radii.
- **How:** `salons` and `jobs` have `latitude`/`longitude`, set by a database trigger (`set_coordinates`)
  whenever state, suburb or postcode change, so no code path can forget. The suburb and postcode centres
  are tables (`localities`, `postcodes`) loaded by a migration that `tools/directory/localities.ts`
  generates. The search uses a bounding box (indexed) and then the haversine distance; no PostGIS.
- **API:** `GET /v1/jobs` and `GET /v1/salons` take `lat` + `lng` (or `near` with a postcode) and `km`,
  and return `distanceKm`. Near-me result pages are searches, so they're not indexed.

**Why.** Matt wanted job seekers to find salons that are hiring near them. Suburb centres need no
outside service and treat every salon the same; exact pins only exist for imported salons.
