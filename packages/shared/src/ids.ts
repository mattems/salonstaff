/**
 * Prefixed IDs. Stored as UUIDv7 in Postgres (time-ordered, index-friendly)
 * and shown at the API boundary as `<prefix>_<26 chars of base32>`, so an ID
 * says what it refers to.
 */
import { uuidv7 as generate, V7Generator } from "uuidv7";

export const ID_PREFIXES = {
  user: "usr",
  salon: "sln",
  job: "job",
  application: "app",
  check: "chk",
  claim: "clm",
  invite: "inv",
  flag: "flg",
  payment: "pay",
  experience: "exp",
  education: "edu",
  portfolioItem: "pfi",
  auditEvent: "evt",
  staff: "stf",
  passkey: "pk",
  confirmation: "cfm",
  request: "req",
  session: "ses",
  endorsement: "end",
  profileContact: "pct",
  message: "msg",
  conversation: "cnv",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type PrefixedId<K extends IdKind = IdKind> = `${(typeof ID_PREFIXES)[K]}_${string}`;

// Crockford base32, lowercase, as used by TypeID.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUFFIX_RE = /^[0-7][0-9a-hjkmnp-tv-z]{25}$/;

/**
 * Generates a UUIDv7 (RFC 9562): a millisecond timestamp followed by a
 * counter and random bits. Delegates to the `uuidv7` package, which keeps IDs
 * created in the same millisecond in creation order. That matters on
 * Cloudflare Workers, where the clock stands still between I/O operations.
 *
 * Pass `now` only to build an ID for a specific moment (tests, backfills).
 */
export function uuidv7(now?: number): string {
  if (now === undefined) return generate();
  return new V7Generator().generateOrResetCore(now, 10_000).toString();
}

/** `uuid` → `<prefix>_<base32>`. */
export function encodeId<K extends IdKind>(kind: K, uuid: string): PrefixedId<K> {
  const lower = uuid.toLowerCase();
  if (!UUID_RE.test(lower)) {
    throw new TypeError(`Not a UUID: ${uuid}`);
  }
  let n = BigInt(`0x${lower.replaceAll("-", "")}`);
  let suffix = "";
  for (let i = 0; i < 26; i++) {
    suffix = ALPHABET[Number(n & 31n)] + suffix;
    n >>= 5n;
  }
  return `${ID_PREFIXES[kind]}_${suffix}` as PrefixedId<K>;
}

/** `<prefix>_<base32>` → `uuid`, or `null` if it is malformed or the wrong kind. */
export function decodeId(kind: IdKind, id: string): string | null {
  const prefix = `${ID_PREFIXES[kind]}_`;
  if (!id.startsWith(prefix)) return null;
  const suffix = id.slice(prefix.length);
  if (!SUFFIX_RE.test(suffix)) return null;
  let n = 0n;
  for (const ch of suffix) {
    n = (n << 5n) | BigInt(ALPHABET.indexOf(ch));
  }
  const hex = n.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A new ID of the given kind, e.g. `newId("workspace")` → `ws_01k6…`. */
export function newId<K extends IdKind>(kind: K): PrefixedId<K> {
  return encodeId(kind, uuidv7());
}
