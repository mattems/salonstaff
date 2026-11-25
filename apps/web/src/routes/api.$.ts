import { createFileRoute } from "@tanstack/react-router";
import { serverHooks } from "@/lib/server-context";

/**
 * /api/*: the API, on this site's own origin. Every method is forwarded unchanged (path, query,
 * headers including the cookie, body) and the answer comes back as it is, `Set-Cookie` included.
 * The API strips the /api prefix itself (apps/api/src/index.ts). Better Auth's public address is
 * /api/v1/auth, so Google and Apple send people back through here too.
 */
async function forward({ request }: { request: Request }): Promise<Response> {
  const server = serverHooks();
  if (!server) throw new Error("The API proxy runs on the server only");
  try {
    return await server.fetchApi(request);
  } catch (error) {
    console.error("API unreachable", error);
    return Response.json(
      {
        type: "about:blank",
        title: "Service unavailable",
        status: 503,
        code: "unavailable",
        detail: "The API couldn't be reached",
        hint: "Try again in a moment. Locally, start the API with `bunx wrangler dev` in apps/api.",
      },
      { status: 503, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

export const Route = createFileRoute("/api/$")({
  server: { handlers: { ANY: forward } },
});
