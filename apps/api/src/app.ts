import { BRAND } from "@salonstaff/shared";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import type { JWTVerifyGetKey } from "jose";
import { allowedOrigins } from "./lib/actor";
import { createRouter } from "./lib/router";
import { type AuthOptions, authContext } from "./middleware/auth";
import { database } from "./middleware/database";
import { dryRun } from "./middleware/dry-run";
import { notFound, onError } from "./middleware/errors";
import { idempotency } from "./middleware/idempotency";
import { corsPolicy, originCheck } from "./middleware/origin";
import { rateLimit } from "./middleware/rate-limit";
import { requestContext } from "./middleware/request-context";
import { admin } from "./routes/admin";
import "./routes/admin-passkeys";
import "./routes/admin-users";
import "./routes/admin-salons";
import "./routes/admin-jobs";
import "./routes/admin-queues";
import { auth } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { checksRoutes } from "./routes/checks";
import { devRoutes } from "./routes/dev";
import { directoryRoutes } from "./routes/directory";
import { docs } from "./routes/docs";
import { employerRoutes } from "./routes/employer";
import { health } from "./routes/health";
import { jobsRoutes } from "./routes/jobs";
import { meRoutes } from "./routes/me";
import { mediaRoutes } from "./routes/media";
import { myProfileRoutes } from "./routes/my-profile";
import { profileRoutes } from "./routes/profiles";
import { pushRoutes } from "./routes/push";
import { root } from "./routes/root";
import { securityRoutes } from "./routes/security";
import { siteRoutes } from "./routes/site";
import { teamRoutes } from "./routes/team";

export interface AppOptions extends AuthOptions {
  /** Replaces Cloudflare Access's signing keys. Used by tests to sign their own Access tokens. */
  accessKeys?: JWTVerifyGetKey;
}

type App = ReturnType<typeof createRouter>;
type OpenApiDocument = ReturnType<App["getOpenAPI31Document"]>;

const ADMIN_PATH = "/admin/";
const ADMIN_SCHEMA = "Admin";

/**
 * The API's description for one audience. The public reference (website and mobile) leaves the
 * admin portal's routes out; the admin portal's typed client is generated from only those.
 */
export function openApiDocument(app: App, audience: "public" | "admin"): OpenApiDocument {
  const document = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: audience === "admin" ? `${BRAND.name} admin API` : `${BRAND.name} API`,
      version: "1",
      description:
        "Errors use RFC 9457 problem details with a stable `code` and a `hint`. Sign in through `/v1/auth/*` (Better Auth); the website uses a cookie, the mobile app `Authorization: Bearer <session token>`. Send an `Idempotency-Key` header with a `POST` to make it safe to retry. Add `?dry_run=true` to a change to validate it without applying it.",
    },
  });
  const wanted = (isAdmin: boolean) => isAdmin === (audience === "admin");
  document.paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).filter(([path]) => wanted(path.startsWith(ADMIN_PATH))),
  );
  if (document.components?.schemas) {
    document.components.schemas = Object.fromEntries(
      Object.entries(document.components.schemas).filter(
        ([name]) => audience === "admin" || !name.startsWith(ADMIN_SCHEMA),
      ),
    );
  }
  return document;
}

export function createApp(options: AppOptions = {}) {
  const app = createRouter();

  app.use(
    "*",
    timing({
      enabled: (c) => c.env.ENVIRONMENT === "local",
      crossOrigin: (c) => {
        const origin = c.req.header("Origin");
        return origin && allowedOrigins(c).includes(origin) ? origin : false;
      },
    }),
  );
  app.use("*", requestContext());
  // No content security policy for JSON. The one page, /docs, sets its own (routes/docs.ts).
  app.use(
    "*",
    secureHeaders({
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
      xDnsPrefetchControl: false,
      xDownloadOptions: false,
      xPermittedCrossDomainPolicies: false,
      xXssProtection: false,
    }),
  );
  app.use("*", corsPolicy());
  app.use("*", originCheck());
  app.use("*", database());
  app.use("*", authContext(options));
  for (const prefix of ["/v1/*", "/admin/v1/*"]) {
    app.use(prefix, rateLimit());
    app.use(prefix, dryRun());
    app.use(prefix, idempotency());
  }
  if (options.accessKeys) {
    const keys = options.accessKeys;
    app.use("/admin/v1/*", async (c, next) => {
      c.set("accessKeys", keys);
      await next();
    });
  }

  app.onError(onError);
  app.notFound(notFound);

  app.route("/", health);
  app.route("/", root);
  app.route("/", auth);
  app.route("/", meRoutes);
  app.route("/", myProfileRoutes);
  app.route("/", securityRoutes);
  app.route("/", pushRoutes);
  app.route("/", checksRoutes);
  app.route("/", jobsRoutes);
  app.route("/", employerRoutes);
  app.route("/", teamRoutes);
  app.route("/", directoryRoutes);
  app.route("/", profileRoutes);
  app.route("/", billingRoutes);
  app.route("/", siteRoutes);
  app.route("/", mediaRoutes);
  app.route("/", devRoutes);
  app.route("/", admin);

  app.get("/v1/openapi.json", (c) =>
    c.json({ ...openApiDocument(app, "public"), servers: [{ url: new URL(c.req.url).origin }] }),
  );
  app.route("/", docs);

  return app;
}
