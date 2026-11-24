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

describe("approval links from AI apps", () => {
  it("names the app only on a link Scrim signed for this account", async () => {
    process.env.SCRIM_SECRET_KEY ??= Buffer.alloc(32, 7).toString("base64");
    const { signApproval, verifiedApp } = await import("../src/server/approval-links");
    const params = { ai: "Claude", mode: "person", from: "nep141:usdc", amount: "1", recipient: "ada.near" };
    const sig = signApproval("me.near", params);
    expect(verifiedApp("me.near", { ...params, sig })).toBe("Claude");
    expect(verifiedApp("someone-else.near", { ...params, sig })).toBeNull();
    expect(verifiedApp("me.near", { ...params, recipient: "attacker.near", sig })).toBeNull();
    expect(verifiedApp("me.near", { ...params, amount: "100", sig })).toBeNull();
    expect(verifiedApp("me.near", { ...params, ai: "Scrim support", sig })).toBeNull();
    expect(verifiedApp("me.near", params)).toBeNull();
  });
});
