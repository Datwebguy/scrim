// Attacks on an agent's limits. A model that has been tricked by text it read (a poisoned invoice, a fake "payment
// failed, retry" note, a look-alike seller) asks for money anyway. Each case here is what such an agent would ask
// for, and the limits must stop it, or hand it to a person, with a stable reason code.
import { describe, expect, it } from "vitest";
import { evaluatePolicy, refusalReasons, verdictOf, type MandatePolicy } from "@/protocol/policy";
import { limitFor } from "@/server/rate-limit";

const USDC = 1_000_000n;
const policy: MandatePolicy = {
  version: 1,
  perActionCap: (10n * USDC).toString(),
  rollingCap: { amount: (25n * USDC).toString(), windowSeconds: 86_400 },
  counterparties: [
    { address: "bills.near", label: "Bills" },
    { address: "https://seller.example", label: "Seller" },
  ],
  expiresAt: null,
};
const ask = (recipient: string, amount: bigint, extra: { spent?: bigint; enabled?: boolean; now?: Date } = {}) =>
  evaluatePolicy(policy, { recipient, amount, spentInWindow: extra.spent ?? 0n, enabled: extra.enabled ?? true, now: extra.now });
const codes = (d: ReturnType<typeof ask>) => refusalReasons(d).map((r) => r.code);

describe("a tricked agent asks for money it should not", () => {
  it("allows an ordinary payment to an allowed recipient", () => {
    const d = ask("bills.near", 5n * USDC);
    expect(verdictOf(d)).toBe("allowed");
    expect(codes(d)).toEqual([]);
  });

  it("stops a poisoned invoice that names a new address", () => {
    const d = ask("attacker.near", 5n * USDC);
    expect(verdictOf(d)).toBe("refused");
    expect(codes(d)).toEqual(["RECIPIENT_NOT_ALLOWED"]);
  });

  it("stops look-alike accounts and sellers", () => {
    for (const lookalike of ["bi11s.near", "bills.near.evil.near", "billss.near", "https://seller.example.evil.com", "https://sel1er.example", "http://seller.example", "https://seller.example:8443"]) {
      expect(verdictOf(ask(lookalike, USDC)), lookalike).toBe("refused");
    }
  });

  it("stops one huge payment, and a zero payment", () => {
    expect(codes(ask("bills.near", 500n * USDC))).toEqual(["OVER_PAYMENT_LIMIT", "OVER_WINDOW_LIMIT"]);
    expect(codes(ask("bills.near", 11n * USDC))).toEqual(["OVER_PAYMENT_LIMIT"]);
    expect(codes(ask("bills.near", 0n))).toEqual(["OVER_PAYMENT_LIMIT"]);
  });

  it("stops many small payments that add up past the window limit", () => {
    let spent = 0n;
    let allowed = 0;
    for (let i = 0; i < 20; i += 1) {
      const d = ask("bills.near", 5n * USDC, { spent });
      if (verdictOf(d) === "allowed") { allowed += 1; spent += 5n * USDC; } else expect(codes(d)).toEqual(["OVER_WINDOW_LIMIT"]);
    }
    expect(allowed).toBe(5); // $25 in all, then every further request is stopped
  });

  it("stops a paused agent and an expired mandate", () => {
    expect(codes(ask("bills.near", USDC, { enabled: false }))).toEqual(["AGENT_PAUSED"]);
    const expired = evaluatePolicy({ ...policy, expiresAt: "2026-01-01T00:00:00.000Z" }, { recipient: "bills.near", amount: USDC, spentInWindow: 0n, enabled: true, now: new Date("2026-06-01T00:00:00Z") });
    expect(codes(expired)).toEqual(["MANDATE_EXPIRED"]);
  });

  it("names every reason when a request breaks several rules", () => {
    expect(codes(ask("attacker.near", 500n * USDC, { enabled: false }))).toEqual(["AGENT_PAUSED", "RECIPIENT_NOT_ALLOWED", "OVER_PAYMENT_LIMIT", "OVER_WINDOW_LIMIT"]);
  });

  it("hands a repeat inside the limits to a person (a fake \"failed, retry\" note)", () => {
    const d = { ...ask("bills.near", 5n * USDC), hold: { reason: "repeat" as const, detail: "Same recipient and amount as a request from 2 minutes ago." } };
    expect(verdictOf(d)).toBe("needs_person");
    expect(codes(d)).toEqual(["REPEAT_REQUEST"]);
  });
});

describe("email accounts", () => {
  it("have their own, tighter request limit for signing", () => {
    expect(limitFor("/api/v1/email/sign")).toEqual({ group: "/api/v1/email", perMinute: 30 });
  });
});

// An email account signs with no wallet window asking first, so Scrim signs only what it issued to that person.
describe("email signing: only what Scrim itself asked for", () => {
  it("recognises its own request, and nothing else", async () => {
    const { sql } = await import("@/server/db");
    const { challengeIssuedTo, issueChallenge } = await import("@/server/auth");
    const { mainnetImplicitWallet, resetDatabase, signInAs } = await import("./live");
    await resetDatabase();
    const [me, other] = [mainnetImplicitWallet(), mainnetImplicitWallet()];
    const mine = (await signInAs(me)).session;
    const theirs = (await signInAs(other)).session;
    const issued = await issueChallenge(sql, { purpose: "approve_payment", network: "mainnet", lines: ["Approve a payment"], subject: "request-1", sessionId: mine.id });
    const payload = { message: issued.message, nonce: Uint8Array.from(Buffer.from(issued.nonce, "base64")), recipient: issued.recipient };

    expect(await challengeIssuedTo(mine, payload)).toBe(true);
    expect(await challengeIssuedTo(mine, { ...payload, message: payload.message.replace("Approve", "Send everything in") })).toBe(false);
    expect(await challengeIssuedTo(mine, { ...payload, recipient: "intents.near" })).toBe(false);
    expect(await challengeIssuedTo(mine, { ...payload, nonce: new Uint8Array(32) })).toBe(false);
    expect(await challengeIssuedTo(theirs, payload)).toBe(false); // someone else's request is not theirs to sign
    await sql.end();
  });
});
