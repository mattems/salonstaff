/** Query filters a list endpoint takes. */
import { ApiError } from "@salonstaff/shared";

/** A filter's values, comma-separated: `draft,published`. */
export const many = (value: string | undefined) =>
  value
    ? value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : undefined;

/** Refuses a value a filter doesn't know, naming the filter. */
export function only<T extends string>(
  name: string,
  known: readonly T[],
  values: string[] | undefined,
) {
  const wrong = values?.filter((v) => !(known as readonly string[]).includes(v)) ?? [];
  if (wrong.length > 0) {
    throw new ApiError("validation_failed", {
      detail: `${wrong.join(", ")} isn't a ${name} that can be filtered on`,
      hint: `Use any of: ${known.join(", ")}.`,
      errors: [{ path: name, message: "Not a known value" }],
    });
  }
  return values as T[] | undefined;
}
