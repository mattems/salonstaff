import { describe, expect, it } from "vitest";
import { decodeId, encodeId, newId, uuidv7 } from "./ids";

describe("uuidv7", () => {
  it("has version 7 and the RFC 4122 variant", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sorts by creation time", () => {
    const earlier = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_000_001);
    expect(earlier < later).toBe(true);
  });

  it("keeps IDs created in the same millisecond in creation order", () => {
    const ids = Array.from({ length: 2_000 }, () => uuidv7());
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("encodes the timestamp in the first 48 bits", () => {
    const id = uuidv7(0x0123456789ab);
    expect(id.startsWith("01234567-89ab-7")).toBe(true);
  });
});

describe("prefixed ids", () => {
  it("round-trips a uuid", () => {
    const uuid = uuidv7();
    const id = encodeId("salon", uuid);
    expect(id).toMatch(/^sln_[0-7][0-9a-hjkmnp-tv-z]{25}$/);
    expect(decodeId("salon", id)).toBe(uuid);
  });

  it("matches the TypeID reference vectors", () => {
    expect(encodeId("user", "00000000-0000-0000-0000-000000000000")).toBe(
      "usr_00000000000000000000000000",
    );
    expect(encodeId("user", "ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(
      "usr_7zzzzzzzzzzzzzzzzzzzzzzzzz",
    );
    expect(encodeId("user", "01890a5d-ac96-774b-bcce-b302099a8057")).toBe(
      "usr_01h455vb4pex5vsknk084sn02q",
    );
  });

  it("keeps time order after encoding", () => {
    const a = encodeId("salon", uuidv7(1_700_000_000_000));
    const b = encodeId("salon", uuidv7(1_700_000_000_001));
    expect(a < b).toBe(true);
  });

  it("rejects the wrong kind and malformed ids", () => {
    const id = newId("salon");
    expect(decodeId("user", id)).toBeNull();
    expect(decodeId("salon", "sln_short")).toBeNull();
    expect(decodeId("salon", "sln_8zzzzzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
    expect(decodeId("salon", `${id}x`)).toBeNull();
    expect(decodeId("salon", id.toUpperCase())).toBeNull();
  });

  it("rejects input that is not a uuid", () => {
    expect(() => encodeId("user", "nope")).toThrow(TypeError);
  });
});
