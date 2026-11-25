/**
 * What only the Worker knows about the request being served, for code that runs on both sides
 * (loaders, the API client). src/server.ts installs it; in the browser there is none.
 *
 * Kept behind a global rather than imported, so nothing server-only (the API binding, the
 * incoming request) can end up in the browser's bundle.
 */
export interface ServerContext {
  /** The page request being served. Its cookie is forwarded to the API. */
  request: Request;
  /** This response's CSP nonce: the framework's inline scripts carry it. */
  nonce: string;
}

export interface ServerHooks {
  /** The current request's context, or undefined outside a request. */
  current(): ServerContext | undefined;
  /** Sends a request to the API: over the service binding deployed, or to localhost. */
  fetchApi(request: Request): Promise<Response>;
}

const KEY = "__salonstaffServer";

export function installServerHooks(hooks: ServerHooks) {
  (globalThis as Record<string, unknown>)[KEY] = hooks;
}

/** The server's hooks while rendering on the Worker; undefined in the browser. */
export function serverHooks(): ServerHooks | undefined {
  if (typeof window !== "undefined") return undefined;
  return (globalThis as Record<string, unknown>)[KEY] as ServerHooks | undefined;
}
