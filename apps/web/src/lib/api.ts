/**
 * The typed API client (from the API's OpenAPI description, `bun run api:types`).
 *
 * The same client works on both sides:
 *  - in the browser it calls this site's own /api, which the Worker forwards to the API;
 *  - on the Worker (loaders, server routes) it calls the API directly, over the service binding,
 *    passing on the visitor's cookie so pages render for whoever is signed in.
 */
import createClient from "openapi-fetch";
import type { components, paths } from "./api/schema";
import { serverHooks } from "./server-context";

/** The API's named shapes. */
export type Schemas = components["schemas"];
export type FullProfile = Schemas["FullProfile"];

/** A base the Worker can parse; only the path and query travel on. */
const SERVER_BASE = "http://salonstaff.internal/api";

async function isomorphicFetch(request: Request): Promise<Response> {
  const server = serverHooks();
  if (!server) return fetch(request);
  const incoming = server.current()?.request;
  const headers = new Headers(request.headers);
  const cookie = incoming?.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);
  for (const name of ["CF-Connecting-IP", "User-Agent", "Accept-Language"]) {
    const value = incoming?.headers.get(name);
    if (value) headers.set(name, value);
  }
  return server.fetchApi(new Request(request, { headers }));
}

export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? SERVER_BASE : "/api",
  credentials: "same-origin",
  fetch: isomorphicFetch,
});

/** An error answer from the API, in its standard shape (RFC 9457 with `code` and `hint`). */
export class ApiProblem extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string | undefined;
  readonly errors: { path: string; message: string }[];

  constructor(status: number, body: unknown) {
    const problem = (body ?? {}) as {
      title?: string;
      detail?: string;
      message?: string;
      code?: string;
      hint?: string;
      errors?: { path: string; message: string }[];
    };
    super(problem.detail ?? problem.message ?? problem.title ?? "Something went wrong");
    this.name = "ApiProblem";
    this.status = status;
    this.code = problem.code ?? "unknown";
    this.hint = problem.hint;
    this.errors = problem.errors ?? [];
  }

  /** The message for one form field, if the API named it. */
  field(path: string): string | undefined {
    return this.errors.find((error) => error.path === path)?.message;
  }
}

/** The data from a typed call, or an `ApiProblem` thrown. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok) throw new ApiProblem(result.response.status, result.error);
  return result.data as T;
}

/** The data, or null when the API answered 401 or 404. Anything else is thrown. */
export function orNull<T>(result: { data?: T; error?: unknown; response: Response }): T | null {
  if (result.response.status === 404 || result.response.status === 401) return null;
  return unwrap(result);
}

/** A sentence to show a person when something fails. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiProblem) return error.errors[0]?.message ?? error.message;
  return "We couldn't reach Salon Staff. Check your connection and try again.";
}

/** Better Auth's endpoints (/v1/auth/*) aren't in the OpenAPI description: plain JSON calls. */
export async function authCall<T = unknown>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiProblem(response.status, data);
  return data as T;
}

/** Sends a multipart form (photos, certificates) to a typed route. */
export const multipart = (form: FormData) => ({
  body: form as never,
  bodySerializer: (body: unknown) => body as FormData,
});
