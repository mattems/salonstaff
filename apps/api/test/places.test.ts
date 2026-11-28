import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers";

interface Places {
  postcode: string;
  suburbs: { suburb: string; state: string }[];
}

describe("the suburbs in a postcode (D-24)", () => {
  it("lists them with their states, for anyone", async () => {
    const app = createTestApp();
    const res = await app.call("/v1/places/3065");
    expect(res.status).toBe(200);
    const fitzroy = (await res.json()) as Places;
    expect(fitzroy.suburbs).toEqual([{ suburb: "Fitzroy", state: "VIC" }]);

    // Crosses the ACT and NSW line: each suburb says which.
    const border = (await (await app.call("/v1/places/2620")).json()) as Places;
    const states = new Set(border.suburbs.map((s) => s.state));
    expect(states).toEqual(new Set(["ACT", "NSW"]));
    const names = border.suburbs.map((s) => s.suburb);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("is a 404 for a postcode with no suburbs, and a 400 for one that isn't", async () => {
    const app = createTestApp();
    expect((await app.call("/v1/places/0001")).status).toBe(404);
    expect((await app.call("/v1/places/abc")).status).toBe(400);
  });
});
