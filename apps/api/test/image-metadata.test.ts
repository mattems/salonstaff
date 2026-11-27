import { describe, expect, it } from "vitest";
import { stripMetadata } from "../src/lib/image-metadata";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((ch) => ch.charCodeAt(0)) : part,
    ),
  );
const text = (data: Uint8Array) => String.fromCharCode(...data);
const segment = (marker: number, body: Uint8Array) =>
  bytes([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff], [...body]);

/** An Exif body with an orientation and a made-up GPS note after it. */
const exif = (orientation: number) =>
  bytes(
    "Exif\0\0",
    "II",
    [0x2a, 0x00, 0x08, 0x00, 0x00, 0x00],
    [0x01, 0x00],
    [0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x00],
    "GPS -37.8136,144.9631",
  );

describe("stripMetadata", () => {
  const scan = bytes([0xff, 0xda, 0x00, 0x02], "pixels", [0xff, 0xd9]);
  const jfif = segment(0xe0, bytes("JFIF\0"));

  it("takes Exif, XMP, IPTC and comments out of a JPEG, keeping which way up it is", () => {
    const photo = bytes(
      [0xff, 0xd8],
      [...jfif],
      [...segment(0xe1, exif(6))],
      [...segment(0xe1, bytes("http://ns.adobe.com/xap/1.0/\0<x:xmp>home</x:xmp>"))],
      [...segment(0xed, bytes("Photoshop 3.0 caption"))],
      [...segment(0xfe, bytes("a comment"))],
      [...scan],
    );
    const clean = stripMetadata(photo, "image/jpeg");
    expect(text(clean)).not.toMatch(/GPS|xmp|Photoshop|comment/);
    expect(text(clean)).toContain("JFIF");
    expect(text(clean).endsWith(text(scan))).toBe(true);
    // Stripping what's already stripped finds the same orientation and changes nothing.
    expect(stripMetadata(clean, "image/jpeg")).toEqual(clean);
    expect(clean[2 + 29]).toBe(6);
  });

  it("adds nothing to a JPEG that's already upright, and leaves a broken one alone", () => {
    const upright = bytes([0xff, 0xd8], [...jfif], [...segment(0xe1, exif(1))], [...scan]);
    expect(stripMetadata(upright, "image/jpeg")).toEqual(bytes([0xff, 0xd8], [...jfif], [...scan]));
    const broken = bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff], "short");
    expect(stripMetadata(broken, "image/jpeg")).toEqual(broken);
  });

  it("takes text and Exif chunks out of a PNG", () => {
    const chunk = (type: string, body: string) =>
      bytes([0, 0, 0, body.length], type, body, [0, 0, 0, 0]);
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const png = bytes(
      signature,
      [...chunk("IHDR", "header")],
      [...chunk("eXIf", "GPS home")],
      [...chunk("iTXt", "xmp home")],
      [...chunk("IDAT", "pixels")],
      [...chunk("IEND", "")],
    );
    expect(stripMetadata(png, "image/png")).toEqual(
      bytes(
        signature,
        [...chunk("IHDR", "header")],
        [...chunk("IDAT", "pixels")],
        [...chunk("IEND", "")],
      ),
    );
  });

  it("blanks the Exif and XMP items of a HEIC where they lie, and nothing else", () => {
    const u16 = (n: number) => [n >> 8, n & 0xff];
    const u32 = (n: number) => [0, 0, n >> 8, n & 0xff];
    const box = (type: string, ...body: (number[] | string)[]) => {
      const data = bytes(...body);
      return [...bytes(u32(data.length + 8), type, [...data])];
    };
    const infe = (id: number, type: string, extra = "") =>
      box("infe", [2, 0, 0, 0], u16(id), u16(0), type, "\0", extra);
    const picture = "the pixels of the picture";
    const exif = "\0\0\0\x06Exif\0\0MM\0*GPS -37.8136,144.9631";
    const xmp = "<x:xmpmeta>taken at home</x:xmpmeta>";
    const ftyp = box("ftyp", "heic", [0, 0, 0, 0], "mif1heic");
    const build = (offsets: [number, number, number]) => {
      const item = (id: number, offset: number, length: number) => [
        ...u16(id),
        ...u16(0), // construction method: a plain offset in this file
        ...u16(0), // in this file
        ...u16(1), // one extent
        ...u32(offset),
        ...u32(length),
      ];
      const iloc = box(
        "iloc",
        [1, 0, 0, 0],
        [0x44, 0x00],
        u16(3),
        item(1, offsets[0], picture.length),
        item(2, offsets[1], exif.length),
        item(3, offsets[2], xmp.length),
      );
      const iinf = box(
        "iinf",
        [0, 0, 0, 0],
        u16(3),
        infe(1, "hvc1"),
        infe(2, "Exif"),
        infe(3, "mime", "application/rdf+xml\0"),
      );
      const meta = box("meta", [0, 0, 0, 0], iinf, iloc);
      return bytes(ftyp, meta, box("mdat", picture, exif, xmp));
    };
    const data = build([0, 0, 0]).length - (picture.length + exif.length + xmp.length);
    const heic = build([data, data + picture.length, data + picture.length + exif.length]);
    expect(text(heic)).toContain("GPS");

    const clean = stripMetadata(heic, "image/heic");
    expect(clean.length).toBe(heic.length);
    expect(text(clean)).not.toMatch(/GPS|home/);
    expect(text(clean)).toContain(picture);
    // Everything up to the metadata (the index included) is untouched.
    expect(clean.subarray(0, data + picture.length)).toEqual(
      heic.subarray(0, data + picture.length),
    );
    // What's left of the Exif item is an Exif block with nothing in it.
    expect([...clean.subarray(data + picture.length, data + picture.length + 12)]).toEqual([
      0, 0, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8,
    ]);
  });

  it("takes Exif and XMP chunks out of a WebP and says so in its header", () => {
    const chunk = (type: string, body: number[] | string) => {
      const data = bytes(body);
      return bytes(type, [data.length, 0, 0, 0], [...data], data.length % 2 ? [0] : []);
    };
    const riff = (...chunks: Uint8Array[]) => {
      const body = bytes("WEBP", ...chunks.map((c) => [...c]));
      return bytes("RIFF", [body.length, 0, 0, 0], [...body]);
    };
    const webp = riff(
      chunk("VP8X", [0x0c, 0, 0, 0, 1, 0, 0, 1, 0, 0]),
      chunk("VP8 ", "pixels"),
      chunk("EXIF", "GPS home!"),
      chunk("XMP ", "xmp home"),
    );
    expect(stripMetadata(webp, "image/webp")).toEqual(
      riff(chunk("VP8X", [0x00, 0, 0, 0, 1, 0, 0, 1, 0, 0]), chunk("VP8 ", "pixels")),
    );
  });
});
