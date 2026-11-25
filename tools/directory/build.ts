/**
 * Builds CSVs of Australia's hair and beauty businesses for the admin portal's directory
 * import (Directory → Import). Separate from the app: it never touches the database.
 *
 *   bun tools/directory/build.ts [--release 2026-11-18.0] [--min-confidence 0.5] [--no-abn]
 *
 * See README.md for the sources, their licences and what each output file holds.
 */
import { mkdirSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { matchAbns } from "./src/abr";
import {
  CSV_COLUMNS,
  chunk,
  dedupe,
  type Listing,
  placeToListing,
  ROWS_PER_FILE,
  toCsv,
} from "./src/clean";
import { requireDuckdb } from "./src/duckdb";
import { OUT } from "./src/paths";
import { hairAndBeautyPlaces } from "./src/places";
import { abrExtract, absBoundaries, latestOvertureRelease, overturePlaces } from "./src/sources";

const { values: args } = parseArgs({
  options: {
    release: { type: "string" },
    "min-confidence": { type: "string", default: "0.5" },
    "no-abn": { type: "boolean", default: false },
  },
});
const minConfidence = Number(args["min-confidence"]);
if (!(minConfidence >= 0 && minConfidence <= 1)) {
  console.error("--min-confidence must be between 0 and 1");
  process.exit(1);
}

requireDuckdb();
const started = performance.now();

const release = args.release ?? (await latestOvertureRelease());
const overture = await overturePlaces(release);
const boundaries = await absBoundaries();

console.log("• Picking hair and beauty places and finding their suburbs…");
const places = await hairAndBeautyPlaces(overture, boundaries);

type Row = { listing: Listing; note?: string };
const ready: Row[] = [];
const review: Row[] = [];
const dropped: { id: string; name: string; reason: string }[] = [];
for (const place of places) {
  const outcome = placeToListing(place, { minConfidence });
  if (outcome.kind === "listing") ready.push({ listing: outcome.listing });
  else if (outcome.kind === "review") review.push({ listing: outcome.listing, note: outcome.note });
  else dropped.push({ id: place.id, name: place.name ?? "", reason: outcome.reason });
}

// Duplicates are judged across both files, so a salon isn't imported once and reviewed again.
const { kept, duplicates } = dedupe([...ready, ...review]);
for (const { item, of } of duplicates) {
  dropped.push({ id: item.listing.id, name: item.listing.name, reason: `duplicate of ${of}` });
}
const keptSet = new Set(kept);
const toImport = ready.filter((row) => keptSet.has(row));
const toReview = review.filter((row) => keptSet.has(row));

let abnSummary = "skipped (--no-abn)";
if (!args["no-abn"]) {
  const zips = await abrExtract();
  console.log("• Matching ABNs in the ABN Bulk Extract (a few minutes)…");
  const all = [...toImport, ...toReview].map((row) => row.listing);
  const result = await matchAbns(all, zips);
  const n = (count: number) => count.toLocaleString("en-AU");
  abnSummary = `${n(result.matched)} matched; left blank: ${n(result.ambiguous)} matching several ABNs, ${n(result.shared)} sharing one; from ${n(result.records)} ABR records`;
}

// Write the files. Sorted by state, suburb and name so each file covers a region.
const order = (a: Row, b: Row) =>
  a.listing.state.localeCompare(b.listing.state) ||
  a.listing.suburb.localeCompare(b.listing.suburb) ||
  a.listing.name.localeCompare(b.listing.name);
const out = resolve(OUT, new Date().toISOString().slice(0, 10));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = chunk(toImport.sort(order), ROWS_PER_FILE);
for (const [i, rows] of files.entries()) {
  const name = `salons-${String(i + 1).padStart(2, "0")}.csv`;
  await Bun.write(resolve(out, name), toCsv(rows.map(csvRow), CSV_COLUMNS));
}
await Bun.write(
  resolve(out, "review.csv"),
  toCsv(
    toReview
      .sort(order)
      .map((row) => ({ ...csvRow(row), note: row.note ?? "", overture_id: row.listing.id })),
    [...CSV_COLUMNS, "note", "overture_id"],
  ),
);
await Bun.write(resolve(out, "dropped.csv"), toCsv(dropped, ["id", "name", "reason"]));

const n = (count: number) => count.toLocaleString("en-AU");
const withEmail = toImport.filter((row) => row.listing.email).length;
const withAbn = toImport.filter((row) => row.listing.abn).length;
console.log(`
Overture release ${release}, minimum confidence ${minConfidence}
  ${n(places.length)} hair and beauty places
  ${n(toImport.length)} ready to import in ${files.length} file(s) (${n(withEmail)} with an email, ${n(withAbn)} with an ABN)
  ${n(toReview.length)} to check by hand (review.csv: the suburb or postcode is uncertain)
  ${n(dropped.length)} left out (dropped.csv)
  ABNs: ${abnSummary}

Files are in ${relative(process.cwd(), out) || "."}/
Import the salons-*.csv files in the admin portal (Directory → Import). Importing a file twice
adds nothing: salons already listed are skipped.
Done in ${((performance.now() - started) / 60000).toFixed(1)} minutes.`);

function csvRow({ listing }: Row): Record<string, string> {
  const { id: _id, confidence: _confidence, ...rest } = listing;
  return { ...rest, about: "" };
}
