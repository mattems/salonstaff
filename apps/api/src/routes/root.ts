import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { BRAND } from "@salonstaff/shared";
import type { AppEnv } from "../env";

const ApiInfo = z
  .object({
    name: z.string().openapi({ example: `${BRAND.name} API` }),
    version: z.string().openapi({ example: "v1" }),
    environment: z.enum(["local", "production"]),
    docs_url: z.string(),
    openapi_url: z.string(),
  })
  .openapi("ApiInfo");

const route = createRoute({
  method: "get",
  path: "/v1",
  summary: "API information",
  description: "Where to find the documentation and the machine-readable description of this API.",
  tags: ["Meta"],
  responses: {
    200: { description: "API information", content: { "application/json": { schema: ApiInfo } } },
  },
});

export const root = new OpenAPIHono<AppEnv>().openapi(route, (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json(
    {
      name: `${BRAND.name} API`,
      version: "v1",
      environment: c.env.ENVIRONMENT ?? "production",
      docs_url: `${origin}/docs`,
      openapi_url: `${origin}/v1/openapi.json`,
    },
    200,
  );
});
