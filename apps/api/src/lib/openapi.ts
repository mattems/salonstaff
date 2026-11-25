import { z } from "@hono/zod-openapi";

/** The error body every endpoint can return (RFC 9457). */
export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string().openapi({ description: "Stable, machine-readable error code." }),
    detail: z.string().optional(),
    hint: z.string().optional().openapi({ description: "How to fix the problem." }),
    docs_url: z.string().optional(),
    request_id: z.string().optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .openapi("Problem");

/**
 * A named schema (one with `.openapi("Name")`) that may be null here. Use this, not
 * `.nullable()`, which marks the shared component itself nullable everywhere it's used.
 */
export const orNull = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);

export const problemResponse = (description: string) => ({
  description,
  content: { "application/problem+json": { schema: ProblemSchema } },
});
