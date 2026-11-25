/**
 * The rules that turn an Overture place into a directory listing. Pure functions, tested in
 * clean.test.ts.
 */

/** The admin import's header (`DIRECTORY_CSV_COLUMNS` in packages/db/src/back-office.ts). */
export const CSV_COLUMNS = [
  "name",
  "suburb",
  "state",
  "postcode",
  "address",
  "phone",
  "email",
  "website",
  "instagram",
  "abn",
  "about",
] as const;

/** The admin import takes up to 5,000 rows and 5MB per file. */
export const ROWS_PER_FILE = 5000;

/** One place as the DuckDB step writes it (places.ts). */
export interface Place {
  id: string;
  name: string | null;
  category: string;
  address: {
    freeform: string | null;
    locality: string | null;
    postcode: string | null;
    region: string | null;
  } | null;
  phones: string[] | null;
  websites: string[] | null;
  emails: string[] | null;
  socials: string[] | null;
  confidence: number | null;
  operating_status: string | null;
  /** The ABS suburb (SAL 2021) the place's pin is in, e.g. "Richmond (Vic.)". */
  sal_name: string | null;
  sal_state: string | null;
  /** The ABS postal area the pin is in. */
  poa: string | null;
}

export interface Listing {
  id: string;
  confidence: number;
  name: string;
  suburb: string;
  state: string;
  postcode: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  abn: string;
}

export type Outcome =
  | { kind: "listing"; listing: Listing }
  /** Probably a salon, but the address and the map pin disagree: check by hand. */
  | { kind: "review"; listing: Listing; note: string }
  | { kind: "dropped"; reason: string };

const STATES: Record<string, string> = {
  "New South Wales": "NSW",
  Victoria: "VIC",
  Queensland: "QLD",
  "Western Australia": "WA",
  "South Australia": "SA",
  Tasmania: "TAS",
  "Australian Capital Territory": "ACT",
  "Northern Territory": "NT",
};

/** ABS areas that aren't suburbs: "ACT Remainder - Tuggeranong", "No usual address (NSW)"… */
const NOT_SUBURBS = /Remainder|No usual address|Migratory|Offshore/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INSTAGRAM_NOT_HANDLES = new Set(["p", "reel", "reels", "explore", "stories", "accounts"]);
const SOCIAL_HOSTS =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com)$/;

export function placeToListing(place: Place, options: { minConfidence: number }): Outcome {
  const name = tidy(place.name);
  if (!name) return { kind: "dropped", reason: "no name" };
  if (name.length > 200) return { kind: "dropped", reason: "name longer than 200 characters" };
  if (place.operating_status && place.operating_status !== "open") {
    return { kind: "dropped", reason: `marked ${place.operating_status.replace(/_/g, " ")}` };
  }
  const confidence = place.confidence ?? 0;
  if (confidence < options.minConfidence) {
    return { kind: "dropped", reason: `low confidence (${confidence.toFixed(2)})` };
  }
  if (!place.sal_name || !place.sal_state) {
    return { kind: "dropped", reason: "map pin isn't in an Australian suburb" };
  }
  const state = STATES[place.sal_state];
  if (!state) return { kind: "dropped", reason: `in ${place.sal_state}` };
  const suburb = suburbName(place.sal_name);

  const published = postcodeOf(place.address?.postcode);
  const postcode = published ?? place.poa;
  if (!postcode) return { kind: "dropped", reason: "no postcode" };

  const listing: Listing = {
    id: place.id,
    confidence,
    name,
    suburb,
    state,
    postcode,
    address: tidy(place.address?.freeform?.replace(/\s*\n\s*/g, ", ")) ?? "",
    phone: firstOf(place.phones, auPhone),
    email: firstOf(place.emails, email),
    website: firstOf(place.websites, website),
    instagram: firstOf([...(place.socials ?? []), ...(place.websites ?? [])], instagramHandle),
    abn: "",
  };
  if (NOT_SUBURBS.test(place.sal_name)) {
    return {
      kind: "review",
      listing,
      note: `The map pin is in "${place.sal_name}", an ABS area that isn't a suburb`,
    };
  }
  if (published && place.poa && published !== place.poa) {
    return {
      kind: "review",
      listing,
      note: `The address says postcode ${published}, but the map pin is in ${suburb} ${place.poa}`,
    };
  }
  return { kind: "listing", listing };
}

/** "Richmond (Vic.)" → "Richmond"; "Alison (Central Coast - NSW)" → "Alison". */
export function suburbName(salName: string): string {
  return salName.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function postcodeOf(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && /^\d{4}$/.test(v) ? v : null;
}

/** An Australian phone number as +61 and nine digits, or null. */
export function auPhone(value: string): string | null {
  const digits = value.replace(/[\s().-]/g, "");
  if (/^\+61[1-9]\d{8}$/.test(digits)) return digits;
  if (/^0[1-9]\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  if (/^61[1-9]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export function email(value: string): string | null {
  const v = value
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "");
  return EMAIL_RE.test(v) && v.length <= 254 ? v : null;
}

/** A website that isn't a social profile (those go in `instagram` or nowhere). */
export function website(value: string): string | null {
  const url = parseUrl(value);
  if (!url || SOCIAL_HOSTS.test(url.hostname)) return null;
  if (url.href.length > 500) return null;
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : url.href;
}

export function instagramHandle(value: string): string | null {
  const url = parseUrl(value);
  if (!url || !/(^|\.)instagram\.com$/.test(url.hostname)) return null;
  const handle = url.pathname.split("/").filter(Boolean)[0];
  if (!handle || INSTAGRAM_NOT_HANDLES.has(handle.toLowerCase())) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

/**
 * Keeps one listing per name and postcode (the import's duplicate rule), preferring the
 * place Overture is most confident about. Returns the kept listings and the ids dropped.
 */
export function dedupe<T extends { listing: Listing }>(
  items: T[],
): { kept: T[]; duplicates: { item: T; of: string }[] } {
  const best = new Map<string, T>();
  for (const item of items) {
    const key = dupeKey(item.listing);
    const current = best.get(key);
    if (!current || item.listing.confidence > current.listing.confidence) best.set(key, item);
  }
  const keptSet = new Set(best.values());
  const kept = items.filter((item) => keptSet.has(item));
  const duplicates = items
    .filter((item) => !keptSet.has(item))
    .map((item) => ({ item, of: (best.get(dupeKey(item.listing)) as T).listing.id }));
  return { kept, duplicates };
}

/** The import's duplicate key (`dupeKey` in packages/db/src/back-office.ts). */
export const dupeKey = (listing: Pick<Listing, "name" | "postcode">) =>
  `${listing.name.trim().toLowerCase()}|${listing.postcode}`;

/**
 * A business name reduced for matching against the ABR: lower case, no accents or
 * punctuation, "&" as "and", without a leading "the" or a trailing "pty ltd".
 */
export function nameKey(name: string): string {
  let words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words[0] === "the" && words.length > 1) words = words.slice(1);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1) as string)) words = words.slice(0, -1);
  return words.join(" ");
}
const LEGAL_SUFFIXES = new Set(["pty", "ltd", "limited", "proprietary", "inc", "incorporated"]);

/**
 * The keys a salon's name can match on: the whole name, and the name before a branch
 * suffix ("Cute or Dye Hairdressing - Lawnton" → "cute or dye hairdressing") when that
 * still has two words or more.
 */
export function nameKeys(name: string): string[] {
  const keys = new Set([nameKey(name)]);
  const base = name.split(/\s+[-–—|@]\s+|\s*\(/)[0] ?? "";
  const baseKey = nameKey(base);
  if (baseKey.split(" ").length >= 2) keys.add(baseKey);
  keys.delete("");
  return [...keys];
}

export function toCsv(rows: Record<string, string>[], columns: readonly string[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => cell(r[c] ?? "")).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function tidy(value: string | null | undefined): string | null {
  const v = value?.replace(/\s+/g, " ").trim();
  return v || null;
}

function firstOf(values: string[] | null | undefined, pick: (v: string) => string | null): string {
  for (const value of values ?? []) {
    const picked = pick(value);
    if (picked) return picked;
  }
  return "";
}

function parseUrl(value: string): URL | null {
  const v = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !/^https?:\/\//i.test(v)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
