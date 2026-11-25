import { OpenAPIHono } from "@hono/zod-openapi";
import { ApiError } from "@salonstaff/shared";
import type { AppEnv } from "../env";

/** A router with our validation behaviour. Use this for every group of routes. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (result.success) return;
      throw new ApiError("validation_failed", {
        hint: "Fix the fields listed in `errors` and send the request again.",
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    },
  });
}
