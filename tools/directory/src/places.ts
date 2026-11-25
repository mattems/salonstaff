/** Picks the hair and beauty places and finds each one's ABS suburb and postal area. */
import { resolve } from "node:path";
import type { Place } from "./clean";
import { duckdb, quote } from "./duckdb";
import { CACHE } from "./paths";

/**
 * Overture categories (`taxonomy.primary`) that count as hair and beauty. Left out on purpose:
 * massage_therapy, medical_spa (cosmetic doctors), health_spa (float and sauna centres),
 * hair_replacement (mostly scalp tattooing and transplants), tattoo_and_piercing, and the
 * catch-all personal_or_beauty_service (mostly aged care).
 */
export const CATEGORIES = [
  "hair_salon",
  "barber",
  "hair_stylist",
  "kids_hair_salon",
  "hair_extensions",
  "blow_dry_blow_out_service",
  "beauty_salon",
  "nail_salon",
  "skin_care_and_makeup",
  "makeup_artist",
  "permanent_makeup",
  "eyelash_service",
  "eyebrow_service",
  "threading_service",
  "waxing",
  "sugaring",
  "hair_removal",
  "laser_hair_removal",
  "tanning_salon",
  "spray_tanning",
  "tanning_bed",
  "esthetician",
  "day_spa",
  "spa",
] as const;

export async function hairAndBeautyPlaces(
  overture: string,
  boundaries: { suburbs: string; postcodes: string },
): Promise<Place[]> {
  const out = resolve(CACHE, "places.json");
  await duckdb(`
    INSTALL spatial;
    LOAD spatial;
    CREATE TEMP TABLE suburbs AS
      SELECT SAL_NAME21 AS name, STE_NAME21 AS state, geom FROM ST_Read(${quote(boundaries.suburbs)});
    CREATE TEMP TABLE postcodes AS
      SELECT POA_CODE21 AS postcode, geom FROM ST_Read(${quote(boundaries.postcodes)});
    CREATE TEMP TABLE places AS
      SELECT id, name, taxonomy.primary AS category, addresses[1] AS address, phones, websites,
             emails, socials, confidence, operating_status, ST_Point(lon, lat) AS pin
      FROM read_parquet(${quote(overture)})
      WHERE taxonomy.primary IN (${CATEGORIES.map(quote).join(", ")});
    COPY (
      SELECT p.* EXCLUDE (pin, address),
             struct_pack(freeform := p.address.freeform, locality := p.address.locality,
                         postcode := p.address.postcode, region := p.address.region) AS address,
             s.name AS sal_name, s.state AS sal_state, q.postcode AS poa
      FROM places p
      LEFT JOIN suburbs s ON ST_Contains(s.geom, p.pin)
      LEFT JOIN postcodes q ON ST_Contains(q.geom, p.pin)
      ORDER BY p.id
    ) TO ${quote(out)} (FORMAT json);
  `);
  const text = await Bun.file(out).text();
  // A pin exactly where two areas meet can match both; keep the first.
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const place = JSON.parse(line) as Place;
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    places.push(place);
  }
  return places;
}
