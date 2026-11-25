import { ApiError, type ErrorCode } from "@salonstaff/shared";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../env";

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: "validation_failed",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  429: "rate_limited",
};

function respond(c: Context<AppEnv>, error: ApiError): Response {
  const problem = error.toProblem({ requestId: c.get("requestId") });
  return c.body(JSON.stringify(problem), error.status as ContentfulStatusCode, {
    "Content-Type": "application/problem+json",
  });
}

/** Every error leaves the API in the same shape. Unexpected ones are logged and never leak details. */
export const onError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof ApiError) return respond(c, err);
  if (err instanceof HTTPException) {
    return respond(c, new ApiError(STATUS_TO_CODE[err.status] ?? "internal_error"));
  }
  console.error(
    JSON.stringify({
      level: "error",
      event: err.name === "ConfigurationError" ? "configuration_error" : "unhandled_error",
      request_id: c.get("requestId"),
      message: err.message,
      stack: err.stack,
    }),
  );
  return respond(c, new ApiError("internal_error"));
};

export const notFound: NotFoundHandler<AppEnv> = (c) =>
  respond(
    c,
    new ApiError("not_found", {
      detail: `No route for ${c.req.method} ${c.req.path}`,
      hint: "Check the path and method against the API reference.",
    }),
  );
