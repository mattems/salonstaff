import { ApiError, randomBase62 } from "@salonstaff/shared";
import type { Env } from "../env";
import { stripMetadata } from "./image-metadata";

/** What a file really is, judged by its first bytes, never by its name or the browser's word. */
function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { type: "image/png", ext: "png" };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45)
    return { type: "image/webp", ext: "webp" };
  // An `ftyp` box alone is any ISO media file (a video too): it must name a HEIF picture brand.
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    HEIF_BRANDS.has(String.fromCharCode(...bytes.subarray(8, 12)))
  )
    return { type: "image/heic", ext: "heic" };
  if (starts(0x25, 0x50, 0x44, 0x46)) return { type: "application/pdf", ext: "pdf" };
  return null;
}

const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type UploadKind = "image" | "pdf";

/**
 * Checks an upload without storing it (also what a dry run does): its size, and what its bytes
 * say it is.
 */
export async function inspectUpload(
  file: File,
  allow: UploadKind[],
): Promise<{ bytes: Uint8Array; type: string; ext: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("file_too_large", { hint: "Upload a file of 8MB or less." });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes.subarray(0, 16));
  const allowed =
    kind &&
    ((kind.type.startsWith("image/") && allow.includes("image")) ||
      (kind.ext === "pdf" && allow.includes("pdf")));
  if (!kind || !allowed) {
    throw new ApiError("file_not_supported", {
      hint: allow.includes("pdf")
        ? "Upload a PDF, JPG, PNG, WebP or HEIC file."
        : "Upload a JPG, PNG, WebP or HEIC image.",
    });
  }
  return { bytes, ...kind };
}

/**
 * Stores an upload under an unguessable, never-reused name. `public` goes to MEDIA (served
 * at MEDIA_URL); `private` goes to PRIVATE (read only by staff, deleted once decided).
 */
export async function storeUpload(
  env: Env,
  file: File,
  options: { bucket: "public" | "private"; allow: UploadKind[] },
): Promise<{ key: string }> {
  const { bytes, type, ext } = await inspectUpload(file, options.allow);
  const key = `${randomBase62(18)}.${ext}`;
  const bucket = options.bucket === "public" ? env.MEDIA : env.PRIVATE;
  // What anyone can fetch carries no location, device or time. Evidence for staff stays whole.
  const stored = options.bucket === "public" ? stripMetadata(bytes, type) : bytes;
  await bucket.put(key, stored, {
    ...(options.bucket === "public" ? { customMetadata: CLEAN } : {}),
    httpMetadata: {
      contentType: type,
      cacheControl:
        options.bucket === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
    },
  });
  return { key };
}

/** Marks a public file as stored without its metadata. */
const CLEAN = { clean: "1" };

/**
 * Photos stored before metadata was taken out on upload still carry theirs. The daily clean-up
 * calls this: it rewrites up to `limit` of them without it and marks them, so in time every
 * public photo is clean and this finds nothing to do. Returns how many it rewrote.
 */
export async function cleanStoredPhotos(env: Env, limit = 200): Promise<number> {
  let cleaned = 0;
  let cursor: string | undefined;
  // At most 20 pages a run: a bucket bigger than that is finished over the following days.
  for (let page = 0; page < 20 && cleaned < limit; page++) {
    const listed = await env.MEDIA.list({
      limit: 500,
      include: ["customMetadata", "httpMetadata"],
      ...(cursor ? { cursor } : {}),
    });
    for (const item of listed.objects) {
      if (cleaned >= limit) break;
      if (item.customMetadata?.clean || !UPLOAD_KEY_RE.test(item.key)) continue;
      const object = await env.MEDIA.get(item.key);
      if (!object) continue;
      const type = object.httpMetadata?.contentType ?? "";
      const bytes = stripMetadata(new Uint8Array(await object.arrayBuffer()), type);
      // Only if it's still the file that was read: one deleted or replaced meanwhile stays so.
      const written = await env.MEDIA.put(item.key, bytes, {
        customMetadata: CLEAN,
        httpMetadata: object.httpMetadata ?? {},
        onlyIf: { etagMatches: object.etag },
      });
      if (written) cleaned++;
    }
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
  return cleaned;
}

/** 30 uploads a minute per person (UPLOAD_RATE_LIMITER). */
export async function requireUploadAllowance(env: Env, userId: string): Promise<void> {
  if (env.ENVIRONMENT === "local" && env.RATE_LIMITS === "off") return;
  const { success } = await env.UPLOAD_RATE_LIMITER.limit({ key: `upload:${userId}` });
  if (!success) {
    throw new ApiError("rate_limited", {
      detail: "Too many uploads in a minute",
      hint: "Wait a minute, then try again.",
    });
  }
}

/** Deletes stored files, logging (never throwing) on failure: the change they belonged to is done. */
export async function deleteUploads(
  env: Env,
  bucket: "public" | "private",
  keys: (string | null | undefined)[],
): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      deleteUpload(env, bucket, key).catch((error: unknown) =>
        console.error(
          JSON.stringify({
            level: "error",
            event: "file_delete_failed",
            bucket,
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
    ),
  );
}

/** Stored keys look like `<18 bytes of base62>.<ext>`. */
export const UPLOAD_KEY_RE = /^[0-9A-Za-z]{20,32}\.(jpg|png|webp|heic|pdf)$/;

export const mediaUrl = (env: Env, key: string | null | undefined) =>
  key ? `${env.MEDIA_URL}/${key}` : null;

export async function deleteUpload(
  env: Env,
  bucket: "public" | "private",
  key: string | null | undefined,
) {
  if (key) await (bucket === "public" ? env.MEDIA : env.PRIVATE).delete(key);
}
