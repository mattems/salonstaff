/** SHA-256 of a string, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A URL-safe random secret with `bytes` bytes of entropy (32 bytes → 43 characters). */
export function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** `bytes` random bytes written in base62 (letters and digits only). 32 bytes → 43 characters. */
export function randomBase62(bytes = 32): string {
  let n = 0n;
  for (const byte of crypto.getRandomValues(new Uint8Array(bytes))) n = (n << 8n) | BigInt(byte);
  let out = "";
  // Fixed length, so every token looks alike and none is shorter by chance.
  const length = Math.ceil((bytes * 8) / Math.log2(62));
  for (let i = 0; i < length; i++) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out;
}

/** Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L). */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * A verification ID shown to salons, e.g. `SSV-7K3M-9QXA`: the one thing kept about a decided
 * check (D-03). Random, and unbiased: bytes that would favour some letters are skipped.
 */
export function verificationReference(): string {
  const chars: string[] = [];
  const limit = 256 - (256 % REFERENCE_ALPHABET.length);
  while (chars.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && chars.length < 8)
        chars.push(REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length] as string);
    }
  }
  return `SSV-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Lowercase letters and digits that can't be mistaken for each other (no 0/o, 1/i/l). */
const SHARE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/**
 * A job seeker's share code (D-13), e.g. `k7x2m9qd4h`: 10 characters, about 2^49 of them, so
 * profiles can't be found by guessing. Unbiased, as `verificationReference`.
 */
export function shareCode(): string {
  const chars: string[] = [];
  const limit = 256 - (256 % SHARE_ALPHABET.length);
  while (chars.length < 10) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && chars.length < 10)
        chars.push(SHARE_ALPHABET[byte % SHARE_ALPHABET.length] as string);
    }
  }
  return chars.join("");
}

export const SHARE_CODE_RE = /^[2-9a-hjkmnp-z]{10}$/;
