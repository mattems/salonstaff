import { describe, expect, it } from "vitest";
import { loggedPath } from "../src/middleware/request-context";

describe("loggedPath", () => {
  it.each([
    ["/v1/claims/verify/abc123", "/v1/claims/verify/:token"],
    ["/v1/invites/abc123", "/v1/invites/:token"],
    ["/v1/invites/abc123/accept", "/v1/invites/:token/accept"],
    ["/v1/endorsements/abc123", "/v1/endorsements/:token"],
    ["/v1/profiles/k7x2m9qd4h", "/v1/profiles/:token"],
    ["/v1/jobs/job_123/apply", "/v1/jobs/job_123/apply"],
  ])("%s is logged as %s", (path, logged) => {
    expect(loggedPath(path)).toBe(logged);
  });
});
