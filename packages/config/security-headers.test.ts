import { describe, expect, it } from "vitest";
import { securityHeaderLines } from "./security-headers";

describe("security headers", () => {
  it("only asks search engines to stay away when told to", () => {
    expect(securityHeaderLines().some((line) => line.startsWith("X-Robots-Tag"))).toBe(false);
    expect(securityHeaderLines({ noindex: true })).toContain("X-Robots-Tag: noindex, nofollow");
  });

  it("names the origins the app may call", () => {
    const [policy] = securityHeaderLines({ connect: ["https://api.example.test"] });
    expect(policy).toContain("connect-src 'self' https://api.example.test ");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("allows only the inline scripts it's given, and WebAssembly only when asked", () => {
    const [plain] = securityHeaderLines();
    expect(plain).toContain("script-src 'self' https://static.cloudflareinsights.com;");
    const [docs] = securityHeaderLines({ scriptHashes: ["sha256-abc="], wasm: true });
    expect(docs).toContain("script-src 'self' 'wasm-unsafe-eval' 'sha256-abc=' ");
  });

  it("runs a server-rendered page's own inline scripts by their nonce", () => {
    const [policy] = securityHeaderLines({ nonce: "r4nd0m" });
    expect(policy).toContain("script-src 'self' 'nonce-r4nd0m' ");
  });

  it("frames only the origins it's given", () => {
    const [plain] = securityHeaderLines();
    expect(plain).not.toContain("frame-src");
    const [policy] = securityHeaderLines({ frames: ["https://assistant.example.test"] });
    expect(policy).toContain("frame-src 'self' https://assistant.example.test;");
  });

  it("loads scripts from the origins it's given", () => {
    const [policy] = securityHeaderLines({ scripts: ["https://cdn.example.test"] });
    expect(policy).toContain(
      "script-src 'self' https://cdn.example.test https://static.cloudflareinsights.com;",
    );
  });
});
