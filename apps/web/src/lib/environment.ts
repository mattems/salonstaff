import { api } from "./api";

let local: Promise<boolean> | undefined;

/**
 * Whether the API is the local one, where stand-ins exist (dev login, mock ID check, mock
 * checkout). The API decides (`ENVIRONMENT`), so the website can't show them anywhere else.
 */
export function isLocalApi(): Promise<boolean> {
  local ??= api
    .GET("/v1")
    .then(({ data }) => data?.environment === "local")
    .catch(() => {
      local = undefined;
      return false;
    });
  return local;
}
