import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { formatAmount, formatBalance, parseAmount } from "@/protocol/amount";
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
    // A balance keeps at most six decimal places and is never rounded up.
    expect(formatBalance(30005166414749599999997n, 24)).toBe("0.030005");
    expect(formatBalance(85n * 10n ** 24n, 24)).toBe("85.00");
    expect(formatBalance(67207n, 6)).toBe("0.067207");
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

describe("NEAR Intents ownership message", async () => {
  const { ownershipMessage, parseIntentMessage, versionedNonce, isImplicitAccount } = await import("@/protocol/intents-auth");
  it("builds a versioned nonce with salt and deadline", () => {
    const deadline = new Date("2026-10-24T12:00:00.000Z");
    const nonce = versionedNonce("252812b3", deadline, new Date("2026-10-24T11:55:00.000Z"), new Uint8Array(7));
    expect([...nonce.subarray(0, 5)]).toEqual([0x56, 0x28, 0xf6, 0xc6, 0]);
    expect(nonce.subarray(5, 9).toString("hex")).toBe("252812b3");
    expect(nonce.readBigUInt64LE(9)).toBe(BigInt(deadline.getTime()) * 1_000_000n);
    expect(nonce.length).toBe(32);
  });
  it("writes an empty-intent message that cannot move funds", () => {
    const parsed = parseIntentMessage(ownershipMessage("alice.near", new Date("2026-10-24T12:00:00Z")));
    expect(parsed).toEqual({ deadline: "2026-10-24T12:00:00.000Z", intents: [], signer_id: "alice.near" });
  });
  it("recognises implicit accounts", () => {
    expect(isImplicitAccount("a".repeat(64))).toBe(true);
    expect(isImplicitAccount("alice.near")).toBe(false);
  });
});

describe("proofs", async () => {
  const { atLeastAmount, checkProof, describeClaim, signProof } = await import("@/protocol/proof");
  const secret = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secret);
  const issued = new Date("2026-11-01T10:00:00Z");
  const payload = {
    v: 1 as const, id: "11111111-1111-4111-8111-111111111111", reader: "A reader", holder: null,
    issuedAt: issued.toISOString(), expiresAt: new Date(issued.getTime() + 7 * 86_400_000).toISOString(),
    claim: { type: "balance_at_least" as const, amount: "10,000", symbol: null, unit: "usd" as const },
  };
  const token = signProof(payload, secret);

  it("verifies a genuine proof and describes its single claim", () => {
    const check = checkProof(token, publicKey, { now: new Date("2026-11-02T00:00:00Z"), viewer: "a reader" });
    expect(check.ok && check.expired).toBe(false);
    expect(check.ok && check.readerMatches).toBe(true);
    expect(check.ok && describeClaim(check.payload.claim)).toBe("holds at least $10,000 in private funds");
  });
  // Found by a NEAR AI RED review: an "at least" payment proof used to carry the exact amount paid.
  it("keeps only two digits of an \"at least\" payment, so the exact amount stays private", () => {
    const usdc = (n: string) => formatAmount(atLeastAmount(parseAmount(n, 6)), 6, 0);
    expect(usdc("1234.56")).toBe("1,200");
    expect(usdc("87.30")).toBe("87");
    expect(usdc("5")).toBe("5");
    expect(usdc("0.0129")).toBe("0.012");
    expect(atLeastAmount(1_234_560_000n) <= 1_234_560_000n).toBe(true); // never more than was paid
  });
  it("expires at the time inside the signed statement", () => {
    const check = checkProof(token, publicKey, { now: new Date("2026-11-08T10:00:00Z") });
    expect(check.ok && check.expired).toBe(true);
  });
  it("fails closed on any change, a wrong key, a wrong version, or junk", () => {
    const [prefix, body, sig] = token.split(".");
    const changed = Buffer.from(JSON.stringify({ ...payload, reader: "Someone else" })).toString("base64url");
    expect(checkProof(`${prefix}.${changed}.${sig}`, publicKey)).toEqual({ ok: false, reason: "signature" });
    expect(checkProof(token, ed25519.getPublicKey(ed25519.utils.randomSecretKey())).ok).toBe(false);
    expect(checkProof(token.replace("scrimproof1", "scrimproof2"), publicKey)).toEqual({ ok: false, reason: "version" });
    expect(checkProof("junk", publicKey)).toEqual({ ok: false, reason: "format" });
  });
  it("flags a different reader", () => {
    const check = checkProof(token, publicKey, { viewer: "Someone else" });
    expect(check.ok && check.readerMatches).toBe(false);
  });
  it("never puts a balance or an account in the statement", () => {
    expect(Buffer.from(token.split(".")[1], "base64url").toString()).not.toMatch(/accountId|account_id|balance"/i);
  });
});
