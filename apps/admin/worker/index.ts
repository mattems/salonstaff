/**
 * The admin portal's Worker. It serves the built app, and passes the app's
 * API calls to the API Worker over a private service binding, so the browser
 * only ever talks to this hostname, which sits behind Cloudflare Access.
 *
 * The token Access adds to each request travels along untouched. The API
 * checks it; this Worker decides nothing about who is allowed in.
 */
interface Env {
  ASSETS: Fetcher;
  API: Fetcher;
}

const API_PREFIX = "/api";
/** The only part of the API the admin portal may reach. */
const ADMIN_API = "/admin/v1/";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) return env.ASSETS.fetch(request);

    url.pathname = url.pathname.slice(API_PREFIX.length);
    if (!url.pathname.startsWith(ADMIN_API)) {
      return Response.json(
        {
          type: "about:blank",
          title: "Not found",
          status: 404,
          code: "not_found",
          hint: `The admin portal only forwards paths under ${API_PREFIX}${ADMIN_API}`,
        },
        { status: 404, headers: { "Content-Type": "application/problem+json" } },
      );
    }
    return env.API.fetch(new Request(url, request));
  },
} satisfies ExportedHandler<Env>;
