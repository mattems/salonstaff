import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";

const context = { docsBaseUrl: "https://docs.example.test", requestId: "req_123" };

describe("ApiError", () => {
  it("maps a code to its status and title", () => {
    const error = new ApiError("not_found");
    expect(error.status).toBe(404);
    expect(error.toProblem(context)).toEqual({
      type: "https://docs.example.test/errors/not_found",
      title: "Not found",
      status: 404,
      code: "not_found",
      docs_url: "https://docs.example.test/errors/not_found",
      request_id: "req_123",
    });
  });

  it("includes detail, hint and field errors when given", () => {
    const error = new ApiError("validation_failed", {
      detail: "2 fields are invalid",
      hint: "Fix the fields listed in `errors` and send the request again.",
      errors: [{ path: "email", message: "Enter a valid email address" }],
    });
    const problem = error.toProblem(context);
    expect(problem.detail).toBe("2 fields are invalid");
    expect(problem.hint).toMatch(/Fix the fields/);
    expect(problem.errors).toEqual([{ path: "email", message: "Enter a valid email address" }]);
  });

  it("sends no documentation link, and a neutral type, when there are no docs to link to", () => {
    expect(new ApiError("not_found").toProblem({ requestId: "req_123" })).toEqual({
      type: "about:blank",
      title: "Not found",
      status: 404,
      code: "not_found",
      request_id: "req_123",
    });
  });

  it("omits the request id when there is none", () => {
    const problem = new ApiError("forbidden").toProblem({ docsBaseUrl: context.docsBaseUrl });
    expect(problem).not.toHaveProperty("request_id");
  });
});
