/** Finds and downloads the source data into the cache. */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { duckdb, quote } from "./duckdb";
import { CACHE } from "./paths";

const OVERTURE_CATALOG = "https://stac.overturemaps.org/catalog.json";
const OVERTURE_BUCKET = "s3://overturemaps-us-west-2/release";
const ABR_DATASET = "https://data.gov.au/data/api/3/action/package_show?id=abn-bulk-extract";
const ABS_FILES =
  "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files";

/** Mainland Australia and Tasmania, with the Torres Strait. Points outside a suburb are dropped later. */
const AUSTRALIA = { west: 112, east: 154.5, south: -44.5, north: -9 };

mkdirSync(CACHE, { recursive: true });

export async function latestOvertureRelease(): Promise<string> {
  const catalog = (await getJson(OVERTURE_CATALOG)) as { latest?: string };
  if (!catalog.latest) throw new Error(`${OVERTURE_CATALOG} didn't name the latest release`);
  return catalog.latest;
}

/** Every Overture place in Australia for a release, as Parquet (about 1.4 million, 200MB). */
export async function overturePlaces(release: string): Promise<string> {
  const file = resolve(CACHE, `overture-${release}-au.parquet`);
  if (existsSync(file)) return file;
  console.log(`• Downloading Overture places in Australia (release ${release})…`);
  const { west, east, south, north } = AUSTRALIA;
  const partial = `${file}.partial`;
  await duckdb(`
    INSTALL httpfs;
    LOAD httpfs;
    CREATE SECRET overture (TYPE s3, REGION 'us-west-2');
    COPY (
      SELECT id, names.primary AS name, basic_category, taxonomy, addresses, phones, websites,
             emails, socials, confidence, operating_status, sources,
             bbox.xmin AS lon, bbox.ymin AS lat
      FROM read_parquet(${quote(`${OVERTURE_BUCKET}/${release}/theme=places/type=place/*`)})
      WHERE bbox.xmin BETWEEN ${west} AND ${east} AND bbox.ymin BETWEEN ${south} AND ${north}
    ) TO ${quote(partial)} (FORMAT parquet);
  `);
  renameSync(partial, file);
  removeOlder("overture-", file);
  return file;
}

/** The ABS suburbs and localities (SAL) and postal areas (POA), 2021 edition. */
export async function absBoundaries(): Promise<{ suburbs: string; postcodes: string }> {
  const suburbs = await download(`${ABS_FILES}/SAL_2021_AUST_GDA2020_SHP.zip`, "ABS suburbs");
  const postcodes = await download(`${ABS_FILES}/POA_2021_AUST_GDA2020_SHP.zip`, "ABS postcodes");
  return {
    suburbs: `/vsizip/${suburbs}/SAL_2021_AUST_GDA2020.shp`,
    postcodes: `/vsizip/${postcodes}/POA_2021_AUST_GDA2020.shp`,
  };
}

/** The ABN Bulk Extract's zips (two, about 500MB each), refreshed when the ABR publishes new ones. */
export async function abrExtract(): Promise<string[]> {
  const dataset = (await getJson(ABR_DATASET)) as {
    result: { resources: { name: string; url: string; format: string; last_modified: string }[] };
  };
  const zips = dataset.result.resources.filter((r) => r.format.toUpperCase() === "ZIP");
  if (zips.length === 0) throw new Error(`${ABR_DATASET} lists no ZIP files`);
  const files: string[] = [];
  for (const zip of zips) {
    const date = zip.last_modified.slice(0, 10);
    const base = zip.url.split("/").at(-1) as string;
    const file = await download(zip.url, `ABR ${zip.name.trim()}`, `abr-${date}-${base}`);
    removeOlder("abr-", file, base);
    files.push(file);
  }
  return files;
}

async function download(url: string, label: string, name = url.split("/").at(-1) as string) {
  const file = resolve(CACHE, name);
  if (existsSync(file)) return file;
  console.log(`• Downloading ${label}…`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} answered ${res.status}`);
  const partial = `${file}.partial`;
  await Bun.write(partial, res);
  renameSync(partial, file);
  console.log(`  ${(statSync(file).size / 1e6).toFixed(0)}MB`);
  return file;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

/** Deletes older downloads of the same thing once a newer one is in. */
function removeOlder(prefix: string, keep: string, suffix = "") {
  for (const name of readdirSync(CACHE)) {
    const path = resolve(CACHE, name);
    if (path !== keep && name.startsWith(prefix) && name.endsWith(suffix)) rmSync(path);
  }
}
