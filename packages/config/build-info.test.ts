import { describe, expect, it } from "vitest";
import { buildInfo, environmentLabel } from "./build-info";

describe("environment label", () => {
  it("names every environment except production", () => {
    expect(environmentLabel("development")).toBe("Local");
    expect(environmentLabel("staging")).toBe("Staging");
    expect(environmentLabel("production")).toBeNull();
  });

  it("gives production builds nothing to show", () => {
    expect(buildInfo("production").__APP_ENVIRONMENT__).toBe("null");
    expect(JSON.parse(buildInfo("staging").__APP_VERSION__)).toMatch(/^[0-9a-z]+$/);
  });
});
