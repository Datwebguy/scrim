import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAllowedRedirect, isChallenge, pkceMatches, redirectWith } from "../src/protocol/oauth";

describe("AI app sign-in checks", () => {
  it("allows https and local redirects only", () => {
    expect(isAllowedRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirect("http://localhost:6274/callback")).toBe(true);
    expect(isAllowedRedirect("http://127.0.0.1:33418/cb")).toBe(true);
    expect(isAllowedRedirect("http://evil.example/cb")).toBe(false);
    expect(isAllowedRedirect("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirect("https://user:pw@x.example/cb")).toBe(false);
    expect(isAllowedRedirect("https://x.example/cb#frag")).toBe(false);
    expect(isAllowedRedirect("not a url")).toBe(false);
  });

  it("checks PKCE S256", () => {
    const verifier = "a".repeat(43) + "-._~xyz";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(isChallenge(challenge)).toBe(true);
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(verifier + "x", challenge)).toBe(false);
    expect(pkceMatches("short", challenge)).toBe(false);
    expect(isChallenge("plain-text")).toBe(false);
  });

  it("sends results back on the app's address", () => {
    const url = redirectWith("https://app.example/cb?x=1", { code: "abc", state: "s 1", iss: undefined });
    expect(url).toBe("https://app.example/cb?x=1&code=abc&state=s+1");
  });
});
