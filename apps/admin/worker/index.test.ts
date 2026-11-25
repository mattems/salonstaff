import { describe, expect, it } from "vitest";
import worker from "./index";

/** Stand-ins for the two bindings, each recording what it was asked for. */
function bindings() {
  const seen: { to: "assets" | "api"; request: Request }[] = [];
  const binding = (to: "assets" | "api") =>
    ({
      fetch: async (request: Request) => {
        seen.push({ to, request });
        return new Response(to);
      },
    }) as unknown as Fetcher;
  return { env: { ASSETS: binding("assets"), API: binding("api") }, seen };
}

const call = (env: ReturnType<typeof bindings>["env"], path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://admin.example.test${path}`, init) as never, env);

describe("the admin Worker", () => {
  it("serves the app for everything outside /api", async () => {
    const { env, seen } = bindings();
    for (const path of ["/", "/users/usr_123", "/assets/index.js", "/apiary"]) {
      expect(await (await call(env, path)).text()).toBe("assets");
    }
    expect(seen.every((s) => s.to === "assets")).toBe(true);
  });

  it("forwards admin API calls with the method, body, cookie and Access token intact", async () => {
    const { env, seen } = bindings();
    const response = await call(env, "/api/admin/v1/users/usr_123/flags?dry_run=true", {
      method: "POST",
      headers: {
        Cookie: "session=abc",
        "Cf-Access-Jwt-Assertion": "signed-by-cloudflare",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "Hello" }),
    });
    expect(await response.text()).toBe("api");
    const [{ request } = { request: new Request("https://none.test") }] = seen;
    expect(new URL(request.url).pathname).toBe("/admin/v1/users/usr_123/flags");
    expect(new URL(request.url).search).toBe("?dry_run=true");
    expect(request.method).toBe("POST");
    expect(request.headers.get("Cookie")).toBe("session=abc");
    expect(request.headers.get("Cf-Access-Jwt-Assertion")).toBe("signed-by-cloudflare");
    expect(await request.json()).toEqual({ body: "Hello" });
  });

  it("forwards nothing but the admin API", async () => {
    const { env, seen } = bindings();
    for (const path of ["/api/v1/me", "/api/v1/auth/dev-login", "/api/admin/v2/x", "/api/"]) {
      const response = await call(env, path);
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe("not_found");
    }
    expect(seen).toEqual([]);
  });
});
