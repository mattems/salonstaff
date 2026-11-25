import { ApiError } from "@salonstaff/shared";
import { isLocal } from "../lib/auth-config";
import { createRouter } from "../lib/router";
import { UPLOAD_KEY_RE } from "../lib/storage";

/**
 * Public pictures: uploads go to R2's MEDIA bucket. Deployed, they're read straight from its own
 * address (MEDIA_URL, cdn.salonstaff.com.au); locally the API serves them here.
 */
export const mediaRoutes = createRouter();

mediaRoutes.get("/media/:key", async (c) => {
  const key = c.req.param("key");
  const missing = new ApiError("not_found", {
    detail: "No such picture",
    hint: "Use the URL the API returned for it.",
  });
  if (!isLocal(c.env) || !UPLOAD_KEY_RE.test(key)) throw missing;
  const object = await c.env.MEDIA.get(key);
  if (!object) throw missing;
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
