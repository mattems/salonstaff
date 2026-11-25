/** "Near me" search (D-10): the query fields the job and salon searches take, and what they mean. */
import { z } from "@hono/zod-openapi";
import { type Near, publicSite } from "@salonstaff/db";
import { ApiError, DEFAULT_RADIUS_KM, SEARCH_RADII_KM } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";

export const NearQuery = {
  lat: z.coerce.number().min(-45).max(-9).optional().openapi({
    description:
      "Latitude of the point to search near, with `lng`. Round it (2 decimal places is about 1km): places are at their suburb's centre.",
    example: -33.87,
  }),
  lng: z.coerce
    .number()
    .min(112)
    .max(154)
    .optional()
    .openapi({ description: "Longitude, with `lat`.", example: 151.21 }),
  near: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .openapi({
      description: "A postcode to search near, instead of `lat` and `lng`.",
      example: "2010",
    }),
  km: z
    .enum(SEARCH_RADII_KM.map(String) as [string, ...string[]])
    .optional()
    .openapi({ description: `How far from the point, in km. Default ${DEFAULT_RADIUS_KM}.` }),
};

/** The point and radius a search asked for, or undefined when it didn't ask. */
export async function nearFrom(
  c: Context<AppEnv>,
  query: {
    lat?: number | undefined;
    lng?: number | undefined;
    near?: string | undefined;
    km?: string | undefined;
  },
): Promise<Near | undefined> {
  const km = query.km ? Number(query.km) : DEFAULT_RADIUS_KM;
  if (query.lat !== undefined || query.lng !== undefined) {
    if (query.lat === undefined || query.lng === undefined) {
      throw new ApiError("validation_failed", {
        detail: "`lat` and `lng` go together",
        hint: "Send both, or `near` with a postcode instead.",
        errors: [
          { path: query.lat === undefined ? "lat" : "lng", message: "Required with the other" },
        ],
      });
    }
    return { latitude: query.lat, longitude: query.lng, km };
  }
  if (query.near) {
    const centre = await publicSite(await c.get("db")()).postcodeCentre(query.near);
    if (!centre) {
      throw new ApiError("validation_failed", {
        detail: `We don't know where postcode ${query.near} is`,
        hint: "Check the postcode. PO box postcodes have no area; use the suburb's postcode.",
        errors: [{ path: "near", message: "Unknown postcode" }],
      });
    }
    return { ...centre, km };
  }
  return undefined;
}

/** A result's distance as the API shows it: kilometres to one decimal place, or null. */
export const roundedKm = (km: number | null) => (km === null ? null : Math.round(km * 10) / 10);
