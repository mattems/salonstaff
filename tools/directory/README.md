# Directory builder

Builds CSVs of Australia's hair and beauty businesses for the admin portal's directory import
(**Directory → Import**). It's kept apart from the app (not a workspace, not in CI) and never touches
the database: the import does the duplicate checks, URL slugs and audit log. Decision: D-09.

```bash
brew install duckdb                 # once
bun tools/directory/build.ts        # about 5 minutes; the first run downloads about 1.5GB
```

Options: `--release 2026-11-18.0` (an Overture release; default the latest), `--min-confidence 0.5`
(drop places Overture is less sure exist), `--no-abn` (skip the ABN matching and its 1GB download).

Tests: `cd tools/directory && bun test`.

## What it does

1. Downloads every Overture place in Australia for the release (cached in `.cache/`).
2. Keeps the hair and beauty categories (`CATEGORIES` in `src/places.ts`, with what's left out and why).
3. Finds the ABS suburb and postal area each place's map pin is in. Overture's locality is often just
   the city, so the suburb always comes from the pin.
4. Cleans each place (`src/clean.ts`): drops closed, low-confidence and out-of-Australia places; phones
   as +61; emails, websites and Instagram handles checked; one place per name and postcode.
5. Matches ABNs in the ABN Bulk Extract: an active ABN with the same name and postcode, and only when
   exactly one matches (`src/abr.ts`).
6. Writes `out/<date>/`:
   - `salons-01.csv`, `salons-02.csv`…: up to 5,000 listings each, in the import's format. Import them all.
   - `review.csv`: the published postcode and the map pin disagree, or the pin is in an ABS area that
     isn't a suburb ("ACT Remainder"), so the suburb or postcode may be wrong. Fix the rows you want and import the file (the extra `note` and `overture_id` columns are ignored).
   - `dropped.csv`: every place left out and why.

Run it again whenever you like (Overture releases monthly, the ABR weekly): importing adds only salons
that aren't listed yet.

## Suburb and postcode centres (near-me search, D-10)

`localities.ts` writes the SQL that loads the centre of every ABS suburb and postal area into the app's
`localities` and `postcodes` tables. It has run once, for the 2021 edition
(`packages/db/migrations/0002_location_data.sql`). For a new ASGS edition, make a new custom migration
and fill it (the new rows then need replacing the old ones, so write that migration by hand around it):

```bash
bun db:generate -- --custom --name <name>
bun tools/directory/localities.ts packages/db/migrations/<that file>.sql
```

## Sources and licences

| Source | Licence | Attribution |
|---|---|---|
| [Overture Maps Places](https://docs.overturemaps.org/guides/places/) | CDLA Permissive 2.0; Apache 2.0 for Foursquare records | Overture Maps Foundation |
| [ABS Suburbs and Localities, Postal Areas (ASGS 2021)](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3) | CC BY 4.0 | Australian Bureau of Statistics |
| [ABN Bulk Extract](https://data.gov.au/data/dataset/abn-bulk-extract) | CC BY 3.0 AU | Australian Business Register |

The directory pages must credit these, for example: "Business listings include data from the Overture
Maps Foundation, the Australian Bureau of Statistics and the Australian Business Register."
Don't add sources D-04 rules out (scraped Google Maps or Seek data).
