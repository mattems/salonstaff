/**
 * Takes the metadata out of a photo before it's stored where anyone can fetch it: a phone photo
 * carries where it was taken (often someone's home), the device and the time. A JPEG keeps only
 * its orientation, so it still shows the right way up; a HEIC's metadata is blanked in place.
 *
 * Anything that doesn't parse is returned unchanged rather than refused.
 */

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

/** The Orientation tag (1-8) from a JPEG's Exif segment body, or null. */
function exifOrientation(exif: Uint8Array): number | null {
  if (ascii(exif, 0, 6) !== "Exif\0\0" || exif.length < 20) return null;
  const tiff = exif.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const little = ascii(tiff, 0, 2) === "II";
  if (!little && ascii(tiff, 0, 2) !== "MM") return null;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return null;
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i++) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > tiff.length) return null;
    if (view.getUint16(at, little) === 0x0112) {
      const value = view.getUint16(at + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** An Exif segment that says only which way up the picture is. */
const orientationSegment = (orientation: number) =>
  new Uint8Array([
    0xff,
    0xe1,
    0x00,
    0x22, // APP1, 34 bytes
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00, // "Exif\0\0"
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // big-endian TIFF, first directory at 8
    0x00,
    0x01, // one entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00, // Orientation
    0x00,
    0x00,
    0x00,
    0x00, // no more directories
  ]);

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [];
  let orientation: number | null = null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return bytes;
    const marker = bytes[at + 1] as number;
    // The picture itself starts here: everything after is kept as it is.
    if (marker === 0xda) {
      const head = orientation && orientation !== 1 ? [orientationSegment(orientation)] : [];
      return concat([bytes.subarray(0, 2), ...head, ...kept, bytes.subarray(at)]);
    }
    const length = ((bytes[at + 2] as number) << 8) | (bytes[at + 3] as number);
    if (length < 2 || at + 2 + length > bytes.length) return bytes;
    const segment = bytes.subarray(at, at + 2 + length);
    // APP1 (Exif, XMP), APP13 (IPTC) and comments go. Colour profiles and the rest stay.
    if (marker === 0xe1) orientation ??= exifOrientation(segment.subarray(4));
    else if (marker !== 0xed && marker !== 0xfe) kept.push(segment);
    at += 2 + length;
  }
  return bytes;
}

function stripPng(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const end = at + 12 + view.getUint32(at);
    if (end > bytes.length) return bytes;
    const type = ascii(bytes, at + 4, 4);
    if (!["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(type))
      kept.push(bytes.subarray(at, end));
    at = end;
    if (type === "IEND") return concat(kept);
  }
  return bytes;
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [];
  let at = 12;
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    const end = Math.min(at + 8 + size + (size % 2), bytes.length);
    if (at + 8 + size > bytes.length) return bytes;
    const type = ascii(bytes, at, 4);
    if (type === "VP8X" && size >= 1) {
      // The header says which extras follow: no Exif (0x08), no XMP (0x04).
      const chunk = bytes.slice(at, end);
      chunk[8] = (chunk[8] as number) & ~0x0c;
      kept.push(chunk);
    } else if (type !== "EXIF" && type !== "XMP ") {
      kept.push(bytes.subarray(at, end));
    }
    at = end;
  }
  const body = concat(kept);
  const head = bytes.slice(0, 12);
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  return concat([head, body]);
}

/** The boxes inside `bytes[from, to)`: an ISO media file is boxes within boxes. */
function* boxes(bytes: Uint8Array, from: number, to: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    let head = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      head = 16;
    } else if (size === 0) size = to - at;
    if (size < head || at + size > to) return;
    yield { type: ascii(bytes, at + 4, 4), start: at + head, end: at + size };
    at += size;
  }
}

/** A metadata payload that says nothing: an Exif block with no entries. */
const EMPTY_EXIF = [0, 0, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0];

/**
 * A HEIC keeps its Exif and XMP as items the file's index points at. Cutting them out would mean
 * rewriting every offset in that index, so they're blanked where they lie instead: the file is
 * the same size and shape, with nothing in those items. Which way up the picture is isn't in the
 * Exif (it's a property of the image), so nothing is lost.
 */
function stripHeic(input: Uint8Array): Uint8Array {
  const bytes = input.slice();
  const view = new DataView(bytes.buffer);
  const uint = (at: number, size: number) => {
    if (size === 0) return 0;
    if (size === 2) return view.getUint16(at);
    if (size === 4) return view.getUint32(at);
    if (size === 8) return Number(view.getBigUint64(at));
    throw new Error("An index field of an unexpected size");
  };
  const meta = [...boxes(bytes, 0, bytes.length)].find((box) => box.type === "meta");
  if (!meta) return input;
  const inside = [...boxes(bytes, meta.start + 4, meta.end)];
  const iinf = inside.find((box) => box.type === "iinf");
  const iloc = inside.find((box) => box.type === "iloc");
  if (!iinf || !iloc) return input;

  // Which items are metadata: Exif, and XMP (a `mime` item of RDF).
  const metadata = new Map<number, "exif" | "xmp">();
  const wide = bytes[iinf.start] !== 0;
  for (const entry of boxes(bytes, iinf.start + (wide ? 8 : 6), iinf.end)) {
    if (entry.type !== "infe") continue;
    const version = bytes[entry.start] as number;
    if (version < 2) continue;
    const idSize = version === 2 ? 2 : 4;
    const id = uint(entry.start + 4, idSize);
    const typeAt = entry.start + 4 + idSize + 2;
    const type = ascii(bytes, typeAt, 4);
    if (type === "Exif") metadata.set(id, "exif");
    else if (
      type === "mime" &&
      ascii(bytes, typeAt + 4, entry.end - typeAt - 4).includes("rdf+xml")
    )
      metadata.set(id, "xmp");
  }
  if (metadata.size === 0) return input;

  const version = bytes[iloc.start] as number;
  const offsetSize = (bytes[iloc.start + 4] as number) >> 4;
  const lengthSize = (bytes[iloc.start + 4] as number) & 0x0f;
  const baseSize = (bytes[iloc.start + 5] as number) >> 4;
  const indexSize = version > 0 ? (bytes[iloc.start + 5] as number) & 0x0f : 0;
  let at = iloc.start + 6;
  const count = uint(at, version < 2 ? 2 : 4);
  at += version < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = uint(at, version < 2 ? 2 : 4);
    at += version < 2 ? 2 : 4;
    const method = version > 0 ? view.getUint16(at) & 0x0f : 0;
    if (version > 0) at += 2;
    const elsewhere = view.getUint16(at) !== 0;
    at += 2;
    const base = uint(at, baseSize);
    at += baseSize;
    const extents = view.getUint16(at);
    at += 2;
    const kind = metadata.get(id);
    for (let e = 0; e < extents; e++) {
      at += indexSize;
      const start = base + uint(at, offsetSize);
      at += offsetSize;
      const length = uint(at, lengthSize);
      at += lengthSize;
      // Only what's in this file at a plain offset; anything else is left as it is.
      if (!kind || method !== 0 || elsewhere || start + length > bytes.length) continue;
      bytes.fill(kind === "xmp" ? 0x20 : 0, start, start + length);
      if (kind === "exif" && e === 0 && length >= EMPTY_EXIF.length) bytes.set(EMPTY_EXIF, start);
    }
  }
  return bytes;
}

export function stripMetadata(bytes: Uint8Array, type: string): Uint8Array {
  try {
    if (type === "image/jpeg") return stripJpeg(bytes);
    if (type === "image/png") return stripPng(bytes);
    if (type === "image/webp") return stripWebp(bytes);
    if (type === "image/heic") return stripHeic(bytes);
  } catch {
    // Not what it said it was, deep down: store it as it came.
  }
  return bytes;
}
