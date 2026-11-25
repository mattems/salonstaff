import { z } from "@hono/zod-openapi";
import { ApiError } from "@salonstaff/shared";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

/** Query parameters every list endpoint accepts. */
export const PaginationQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .openapi({ description: "How many items to return.", example: DEFAULT_PAGE_SIZE }),
  cursor: z
    .string()
    .optional()
    .openapi({ description: "The `next_cursor` from the previous page. Omit for the first page." }),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Cursors are opaque to callers. Inside, a cursor is the ID of the last row on the page. */
export function encodeCursor(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  let decoded: string;
  try {
    decoded = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    decoded = "";
  }
  if (!UUID_RE.test(decoded)) badCursor();
  return decoded;
}

/** A cursor for a list ordered by an amount, then ID: `toPage` writes it as `amount.id`. */
export function decodeAmountCursor(
  cursor: string | undefined,
): { amount: number; id: string } | undefined {
  if (cursor === undefined) return undefined;
  let decoded = "";
  try {
    decoded = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {}
  const [amount, id] = decoded.split(".");
  if (!amount || !/^[0-9]{1,15}$/.test(amount) || !id || !UUID_RE.test(id)) badCursor();
  return { amount: Number(amount), id };
}

function badCursor(): never {
  throw new ApiError("validation_failed", {
    detail: "The cursor is not valid",
    hint: "Pass the `next_cursor` value from the previous response unchanged, or omit it to start from the first page.",
    errors: [{ path: "cursor", message: "Not a cursor returned by this API" }],
  });
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

/**
 * Turns `limit + 1` fetched rows into a page. The extra row only tells us
 * whether another page exists; it is not returned.
 */
export function toPage<T>(rows: T[], limit: number, idOf: (row: T) => string): Page<T> {
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  return {
    data,
    next_cursor: rows.length > limit && last !== undefined ? encodeCursor(idOf(last)) : null,
  };
}
