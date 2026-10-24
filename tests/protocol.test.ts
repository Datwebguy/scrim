import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { formatAmount, parseAmount } from "@/protocol/amount";
import { canonicalJson, commitment } from "@/protocol/canonical";
import { normalizeEvmAddress, normalizeNearAccount } from "@/protocol/identifiers";
import { encodePublicKey, nep413Digest, serializeNep413, verifyNep413 } from "@/protocol/nep413";
import { evaluatePolicy, policyCommitment, type MandatePolicy } from "@/protocol/policy";

const VENDOR = "0x1111111111111111111111111111111111111111";
const policy: MandatePolicy = {
  version: 1,
  perActionCap: parseAmount("500").toString(),
  rollingCap: { amount: parseAmount("1200").toString(), windowSeconds: 86_400 },
  counterparties: [{ address: VENDOR, label: "Compute vendor" }],
  expiresAt: null,
};

describe("amounts", () => {
  it("parses decimal strings into minor units without floats", () => {
    expect(parseAmount("250.5")).toBe(250_500_000n);
    expect(parseAmount("0.000001")).toBe(1n);
    expect(parseAmount("1,200")).toBe(1_200_000_000n);
  });
  it("rejects too many decimals and junk", () => {
    expect(() => parseAmount("1.0000001")).toThrow();
    expect(() => parseAmount("-5")).toThrow();
    expect(() => parseAmount("1e6")).toThrow();
  });
  it("formats minor units", () => {
    expect(formatAmount(1_234_567_890n)).toBe("1,234.56789");
    expect(formatAmount(5_000_000n)).toBe("5.00");
  });
});

describe("identifiers", () => {
  it("normalizes NEAR accounts and EVM addresses", () => {
    expect(normalizeNearAccount(" Alice.Testnet ")).toBe("alice.testnet");
    expect(normalizeNearAccount("bad..name")).toBeNull();
    expect(normalizeEvmAddress("0xABCDEF0000000000000000000000000000000001")).toBe("0xabcdef0000000000000000000000000000000001");
    expect(normalizeEvmAddress("0x123")).toBeNull();
  });
});

describe("commitments", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(commitment("x", { a: 1, b: 2 })).toBe(commitment("x", { b: 2, a: 1 }));
    expect(commitment("x", { a: 1 })).not.toBe(commitment("y", { a: 1 }));
  });
  it("changes when any policy term changes", () => {
    expect(policyCommitment(policy)).not.toBe(policyCommitment({ ...policy, perActionCap: "1" }));
  });
});

describe("policy engine", () => {
  const base = { recipient: VENDOR, amount: parseAmount("120"), spentInWindow: 0n, enabled: true };

  it("allows an approved counterparty within both caps", () => {
    const decision = evaluatePolicy(policy, base);
    expect(decision.allowed).toBe(true);
    expect(decision.checks.every((c) => c.passed)).toBe(true);
  });
  it("blocks an unknown recipient", () => {
    const decision = evaluatePolicy(policy, { ...base, recipient: "0x2222222222222222222222222222222222222222" });
    expect(decision.allowed).toBe(false);
    expect(decision.checks.find((c) => c.rule === "counterparty")?.passed).toBe(false);
  });
  it("enforces the per-action cap at the boundary", () => {
    expect(evaluatePolicy(policy, { ...base, amount: parseAmount("500") }).allowed).toBe(true);
    expect(evaluatePolicy(policy, { ...base, amount: parseAmount("500.000001") }).allowed).toBe(false);
  });
  it("enforces the rolling cap including prior spend", () => {
    expect(evaluatePolicy(policy, { ...base, amount: parseAmount("200"), spentInWindow: parseAmount("1000") }).allowed).toBe(true);
    expect(evaluatePolicy(policy, { ...base, amount: parseAmount("200.01"), spentInWindow: parseAmount("1000") }).allowed).toBe(false);
  });
  it("blocks paused and expired mandates", () => {
    expect(evaluatePolicy(policy, { ...base, enabled: false }).allowed).toBe(false);
    const expired = { ...policy, expiresAt: "2020-01-01T00:00:00Z" };
    expect(evaluatePolicy(expired, base).allowed).toBe(false);
  });
  it("rejects zero amounts", () => {
    expect(evaluatePolicy(policy, { ...base, amount: 0n }).allowed).toBe(false);
  });
});

describe("NEP-413", () => {
  const secret = ed25519.utils.randomSecretKey();
  const publicKey = encodePublicKey(ed25519.getPublicKey(secret));
  const payload = { message: "Sign in to Scrim", nonce: new Uint8Array(32).fill(7), recipient: "scrim.local" };
  const signature = Buffer.from(ed25519.sign(nep413Digest(payload), secret)).toString("base64");

  it("serializes with the NEP-413 tag prefix", () => {
    const bytes = serializeNep413(payload);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(2 ** 31 + 413);
    expect(bytes.at(-1)).toBe(0); // no callback URL
  });
  it("verifies a valid signature", () => {
    expect(verifyNep413(payload, publicKey, signature)).toBe(true);
  });
  it("rejects a changed message, nonce, recipient, or key", () => {
    expect(verifyNep413({ ...payload, message: "Sign in to Scrim!" }, publicKey, signature)).toBe(false);
    expect(verifyNep413({ ...payload, nonce: new Uint8Array(32) }, publicKey, signature)).toBe(false);
    expect(verifyNep413({ ...payload, recipient: "evil.example" }, publicKey, signature)).toBe(false);
    const other = encodePublicKey(ed25519.getPublicKey(ed25519.utils.randomSecretKey()));
    expect(verifyNep413(payload, other, signature)).toBe(false);
  });
  it("rejects malformed input without throwing", () => {
    expect(verifyNep413(payload, "ed25519:xyz", signature)).toBe(false);
    expect(verifyNep413(payload, publicKey, "not-a-signature")).toBe(false);
  });
});
