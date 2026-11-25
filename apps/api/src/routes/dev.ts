import { createRoute, z } from "@hono/zod-openapi";
import { billing, checks, seeker } from "@salonstaff/db";
import { ApiError } from "@salonstaff/shared";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { isLocal } from "../lib/auth-config";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { json, jsonBody, pathParam } from "../lib/schemas";
import { billingOn } from "../lib/stripe";

/**
 * Local stand-ins for Stripe: the website's mock identity and checkout pages finish here.
 * Only when ENVIRONMENT is local; anywhere else every route is a 404.
 */
export const devRoutes = createRouter();

const localOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isLocal(c.env)) {
    throw new ApiError("not_found", {
      detail: `No route for ${c.req.method} ${c.req.path}`,
      hint: "Check the path and method against the API reference.",
    });
  }
  await next();
};
devRoutes.use("/v1/dev/*", localOnly);

const Done = z.object({ status: z.string() }).openapi("DevOutcome");

devRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/dev/identity/{ref}",
    summary: "Finish a mock identity check (local only)",
    description:
      "What Stripe Identity's webhook does deployed. `verified` passes the check with the profile's own name, so the name matches.",
    tags: ["Development"],
    request: {
      params: z.object({ ref: pathParam("ref", "mock_4fQ9…") }),
      ...jsonBody(z.object({ outcome: z.enum(["verified", "failed"]) })),
    },
    responses: {
      200: json(Done, "The check's new status"),
      404: problemResponse("No such mock check"),
    },
  }),
  async (c) => {
    const { ref } = c.req.valid("param");
    const { outcome } = c.req.valid("json");
    const data = checks(await c.get("db")());
    const check = await data.findByProviderRef(ref);
    if (check?.provider !== "mock") {
      throw new ApiError("not_found", {
        detail: "No mock identity check with that reference",
        hint: "Start one with POST /v1/me/checks/identity and use the `ref` in its URL.",
      });
    }
    if (c.get("dryRun")) return c.json({ status: outcome }, 200);
    const own = await seeker(await c.get("db")(), check.userId).profile();
    const done = await data.completeIdentity(
      ref,
      outcome === "verified"
        ? {
            status: "verified",
            idName: own ? { firstName: own.firstName, lastName: own.lastName } : undefined,
          }
        : { status: "failed" },
      { type: "system", requestId: c.get("requestId") },
    );
    return c.json({ status: done?.status ?? outcome }, 200);
  },
);

devRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/dev/checkout/{ref}",
    summary: "Finish a mock checkout (local only)",
    description: "What Stripe's checkout webhook does deployed: `paid` grants what was bought.",
    tags: ["Development"],
    request: {
      params: z.object({ ref: pathParam("ref", "mock_4fQ9…") }),
      ...jsonBody(z.object({ outcome: z.enum(["paid", "cancelled"]) })),
    },
    responses: {
      200: json(Done, "The payment's new status"),
      404: problemResponse("No such mock checkout"),
    },
  }),
  async (c) => {
    const { ref } = c.req.valid("param");
    const { outcome } = c.req.valid("json");
    const data = billing(await c.get("db")());
    const payment = await data.paymentByRef(ref);
    if (payment?.provider !== "mock" || billingOn(c.env)) {
      throw new ApiError("not_found", {
        detail: "No mock checkout with that reference",
        hint: "Start one with POST /v1/employer/salons/{salonId}/billing/checkout and use the `ref` in its URL.",
      });
    }
    if (c.get("dryRun")) return c.json({ status: outcome }, 200);
    const actor = { type: "system" as const, requestId: c.get("requestId") };
    const done =
      outcome === "paid" ? await data.fulfil(ref, {}, actor) : await data.fail(ref, actor);
    return c.json({ status: done?.status ?? payment.status }, 200);
  },
);
