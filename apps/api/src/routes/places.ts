import { createRoute, z } from "@hono/zod-openapi";
import { publicSite } from "@salonstaff/db";
import { ApiError } from "@salonstaff/shared";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { AuStateSchema, errors, json } from "../lib/schemas";

/** Places in Australia: which suburbs a postcode covers, for typing only a postcode (D-24). */
export const placesRoutes = createRouter();

const TAGS = ["Places"];

const PostcodePlacesSchema = z
  .object({
    postcode: z.string().openapi({ example: "3065" }),
    suburbs: z
      .array(
        z.object({
          suburb: z.string().openapi({ example: "Fitzroy" }),
          state: AuStateSchema,
        }),
      )
      .openapi({ description: "By name. One for most postcodes; some cover dozens." }),
  })
  .openapi("PostcodePlaces");

placesRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/places/{postcode}",
    summary: "The suburbs in a postcode",
    description:
      "The suburbs and localities a four-digit postcode covers, each with its state (a postcode can cross a state line). The app asks for a postcode only and offers these to pick from (D-24). From the ABS's localities (D-10); a postcode with none (a PO box, say) is a 404.",
    tags: TAGS,
    request: {
      params: z.object({
        postcode: z
          .string()
          .regex(/^\d{4}$/, "A postcode is four digits")
          .openapi({ example: "3065" }),
      }),
    },
    responses: {
      200: json(PostcodePlacesSchema, "Its suburbs"),
      400: errors[400],
      404: problemResponse("No suburbs for that postcode"),
    },
  }),
  async (c) => {
    const { postcode } = c.req.valid("param");
    const suburbs = await publicSite(await c.get("db")()).suburbsIn(postcode);
    if (!suburbs.length) {
      throw new ApiError("not_found", {
        detail: `No suburbs for postcode ${postcode}`,
        hint: "Check the postcode: it's the four digits of where you live, not a PO box.",
      });
    }
    return c.json({ postcode, suburbs }, 200);
  },
);
