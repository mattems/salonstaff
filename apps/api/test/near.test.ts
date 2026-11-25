import { decodeId } from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { postJob, salonOwner, uid } from "./fixtures";
import { createTestApp, query } from "./helpers";

type App = ReturnType<typeof createTestApp>;
const get = async <T>(app: App, path: string) => {
  const response = await app.call(path);
  return { status: response.status, body: (await response.json()) as T };
};
type Results = { items: { id: string; distanceKm: number | null }[]; total: number };

/** Surry Hills (2010) is in Sydney; Parramatta (2150) is about 20km west; Newcastle (2300) about 120km north. */
async function threeJobs(app: App) {
  const tag = `Nearby ${uid()}`;
  const { owner, salon } = await salonOwner(app, {
    name: `${tag} Salon`,
    suburb: "Surry Hills",
    postcode: "2010",
  });
  const surryHills = await postJob(owner, { title: `${tag} Surry Hills` });
  const parramatta = await postJob(owner, {
    title: `${tag} Parramatta`,
    suburb: "Parramatta",
    postcode: "2150",
  });
  const newcastle = await postJob(owner, {
    title: `${tag} Newcastle`,
    suburb: "Newcastle",
    postcode: "2300",
  });
  return { tag, owner, salon, surryHills, parramatta, newcastle };
}

describe("near me", () => {
  it("finds live jobs within a radius, nearest first, with their distance", async () => {
    const app = createTestApp();
    const { tag, surryHills, parramatta, newcastle } = await threeJobs(app);
    const q = encodeURIComponent(tag);

    const close = await get<Results>(app, `/v1/jobs?q=${q}&near=2010&km=10`);
    expect(close.status).toBe(200);
    expect(close.body.items.map((j) => j.id)).toEqual([surryHills.id]);
    expect(close.body.items[0]?.distanceKm).toBeLessThan(3);

    const wider = await get<Results>(app, `/v1/jobs?q=${q}&near=2010&km=50`);
    expect(wider.body.items.map((j) => j.id)).toEqual([surryHills.id, parramatta.id]);
    expect(wider.body.items[1]?.distanceKm).toBeGreaterThan(15);
    expect(wider.body.items[1]?.distanceKm).toBeLessThan(25);

    // From Newcastle's side, by coordinates.
    const north = await get<Results>(app, `/v1/jobs?q=${q}&lat=-32.93&lng=151.75&km=25`);
    expect(north.body.items.map((j) => j.id)).toEqual([newcastle.id]);

    // Without a point there's no distance.
    const all = await get<Results>(app, `/v1/jobs?q=${q}`);
    expect(all.body.total).toBe(3);
    expect(all.body.items.every((j) => j.distanceKm === null)).toBe(true);
  });

  it("finds salons within a radius, hiring first", async () => {
    const app = createTestApp();
    const { tag, salon } = await threeJobs(app);
    const { salon: quiet } = await salonOwner(app, {
      name: `${tag} Quiet`,
      suburb: "Redfern",
      postcode: "2016",
    });
    type Salons = { items: { id: string; liveJobs: number; distanceKm: number | null }[] };
    const q = encodeURIComponent(tag);

    const near = await get<Salons>(app, `/v1/salons?q=${q}&near=2010&km=5`);
    expect(near.status).toBe(200);
    expect(near.body.items.map((s) => s.id)).toEqual([salon.id, quiet.id]);
    expect(near.body.items[1]?.distanceKm).toBeLessThan(5);

    const hiring = await get<Salons>(app, `/v1/salons?q=${q}&near=2010&km=5&hiring=true`);
    expect(hiring.body.items.map((s) => s.id)).toEqual([salon.id]);

    const far = await get<Salons>(app, `/v1/salons?q=${q}&near=2300&km=25`);
    expect(far.body.items).toEqual([]);
  });

  it("refuses half a point, an unknown postcode and an odd radius", async () => {
    const app = createTestApp();
    for (const path of [
      "/v1/jobs?lat=-33.87",
      "/v1/jobs?near=0001",
      "/v1/jobs?near=2010&km=7",
      "/v1/salons?lng=151.2",
      "/v1/salons?lat=51.5&lng=-0.12",
    ]) {
      const response = await get<{ code: string; hint: string }>(app, path);
      expect(response.status, path).toBe(400);
      expect(response.body.code, path).toBe("validation_failed");
    }
  });

  it("places salons and jobs at their suburb's centre, else their postcode's, and moves them", async () => {
    const app = createTestApp();
    const { owner, salon, surryHills } = await threeJobs(app);
    const where = async (table: "salons" | "jobs", prefixed: string) => {
      const id = decodeId(table === "salons" ? "salon" : "job", prefixed) as string;
      const [row] = await query<{ latitude: number | null; longitude: number | null }>(
        sql`select latitude, longitude from ${sql.identifier(table)} where id = ${id}`,
      );
      return row;
    };
    const surry = await where("jobs", surryHills.id);
    expect(surry?.latitude).toBeCloseTo(-33.88, 1);
    expect(surry?.longitude).toBeCloseTo(151.21, 1);

    // A suburb we don't know (a typo) falls back to the postcode's centre.
    const typo = await postJob(owner, { title: `Typo ${uid()}`, suburb: "Sury Hils" });
    const fallback = await where("jobs", typo.id);
    expect(fallback?.latitude).toBeCloseTo(-33.88, 1);

    // Moving the salon moves its coordinates.
    const moved = await owner.api("PATCH", "/v1/salon", { suburb: "Newcastle", postcode: "2300" });
    expect(moved.status).toBe(200);
    const after = await where("salons", salon.id);
    expect(after?.latitude).toBeCloseTo(-32.93, 1);
  });
});
