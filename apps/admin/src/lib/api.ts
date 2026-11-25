import createClient from "openapi-fetch";
import type { paths } from "./api/schema";
import { chosenLocalStaff, LOCAL_STAFF_HEADER } from "./local-staff";

/**
 * Typed client for the admin API. Calls go to this same hostname under /api,
 * and are forwarded to the API from there (see worker/index.ts), so every
 * request passes through Cloudflare Access.
 */
export const api = createClient<paths>({ baseUrl: "/api", credentials: "include" });

api.use({
  onRequest({ request }) {
    const email = chosenLocalStaff();
    if (email) request.headers.set(LOCAL_STAFF_HEADER, email);
    return request;
  },
});

/** An error answer from the API, in its standard shape. */
export class ApiProblem extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string | undefined;
  readonly errors: { path: string; message: string }[];

  constructor(status: number, body: unknown) {
    const problem = (body ?? {}) as {
      title?: string;
      detail?: string;
      code?: string;
      hint?: string;
      errors?: { path: string; message: string }[];
    };
    super(problem.detail ?? problem.title ?? "Something went wrong");
    this.name = "ApiProblem";
    this.status = status;
    this.code = problem.code ?? "unknown";
    this.hint = problem.hint;
    this.errors = problem.errors ?? [];
  }
}

/** The data from a typed call, or an `ApiProblem` thrown. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok) throw new ApiProblem(result.response.status, result.error);
  return result.data as T;
}

/** A sentence to show a person when something fails. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    return error.errors[0]?.message ?? error.message;
  }
  return "We couldn't reach the server. Check your connection and try again.";
}
