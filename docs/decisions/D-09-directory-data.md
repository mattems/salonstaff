# D-09 Where the directory's salons come from

**Status:** Accepted (2026-11-25)

**Decision.** The directory is filled by a script kept apart from the app (`tools/directory`). It builds CSVs
that staff upload through the admin portal's directory import (D-04), so the app's duplicate, slug and
audit rules apply and the script never touches the database. Sources:

- **Overture Maps Places** (CDLA Permissive 2.0, and Apache 2.0 for Foursquare records): the businesses,
  addresses, phones, websites, emails and Instagram handles. Only the hair and beauty categories.
- **ABS Suburbs and Localities and Postal Areas, 2021** (CC BY 4.0): the suburb (and a missing postcode)
  comes from where the map pin is. Overture's own locality is often just the city ("Melbourne").
- **ABN Bulk Extract** (ABR, CC BY 3.0 AU): an ABN only when exactly one active ABN has the same name and
  postcode. A wrong ABN would block the real owner's claim; a missing one doesn't.

Places whose published postcode disagrees with the map pin go to a review file instead of being imported.

**Why.** Matt wanted every hair and beauty business in Australia without scraping (D-04 rules out Google
Maps and Seek). Overture is free, permissive and has emails for about half the salons, which lets most
claims use the email link. OpenStreetMap was left out: it adds little and its ODbL licence is share-alike.

**Owed:** the directory pages must credit the sources (see `tools/directory/README.md`).
