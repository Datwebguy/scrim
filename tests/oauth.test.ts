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
    const signed = signApproval("me.near", "send", params);
    expect(verifiedApp("me.near", "send", signed)).toBe("Claude");
    expect(verifiedApp("me.near", "swap", signed)).toBeNull();
    expect(verifiedApp("someone-else.near", "send", signed)).toBeNull();
    expect(verifiedApp("me.near", "send", { ...signed, recipient: "attacker.near" })).toBeNull();
    expect(verifiedApp("me.near", "send", { ...signed, amount: "100" })).toBeNull();
    expect(verifiedApp("me.near", "send", { ...signed, ai: "Scrim support" })).toBeNull();
    expect(verifiedApp("me.near", "send", { ...signed, exp: String(Date.now() + 9e9) })).toBeNull();
    expect(verifiedApp("me.near", "send", signed, Date.now() + 25 * 3600 * 1000)).toBeNull();
    expect(verifiedApp("me.near", "send", params)).toBeNull();
  });
});

describe("spotting an app that pretends to be another", () => {
  it("flags a known name that returns somewhere else", async () => {
    const { looksImpersonated } = await import("../src/protocol/oauth");
    expect(looksImpersonated("Claude", "https://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(looksImpersonated("Claude Code", "http://localhost:33418/callback")).toBe(false);
    expect(looksImpersonated("ChatGPT", "https://chatgpt.com/connector_platform_oauth_redirect")).toBe(false);
    expect(looksImpersonated("Claude", "https://claude-ai.evil.example/cb")).toBe(true);
    expect(looksImpersonated("ChatGPT", "https://openai.com.evil.example/cb")).toBe(true);
    expect(looksImpersonated("My bot", "https://bot.example/cb")).toBe(false);
  });
});
