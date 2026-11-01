// Regression tests for the security review. Each one is an attack that worked before its fix:
// it must keep failing. Signing uses a real local key and the real x402 library; nothing is faked.
import { x402Client } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseAmount } from "@/protocol/amount";
import { PRIVATE_TREASURY, intentMatchesQuote } from "@/protocol/intents-auth";
import { describeClaim } from "@/protocol/proof";
import { agentFromApiKey, agentSpendInWindow, createAgent } from "@/server/agents";
import type { Session } from "@/server/auth";
import { sql } from "@/server/db";
import { createAgentPayment, getPayment, markTeamRequest } from "@/server/payments";
import { isPrivateAddress } from "@/server/safe-fetch";
import { answerInvitation, createTreasury, listInvitations, listTreasuries, treasuryForMember } from "@/server/treasuries";
import { claimForSigning } from "@/server/x402-client";
import { onlyChosen, payableByWallet } from "@/server/x402-wallet";
import { mainnetImplicitWallet, resetDatabase, signInAs } from "./live";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const entry = (amount: string, extra: Record<string, unknown> = {}): PaymentRequirements => ({
  scheme: "exact", network: "eip155:8453", amount, asset: USDC_BASE, payTo: "0x00000000000000000000000000000000000000aa",
  maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2", ...extra },
});

describe("x402: an agent's wallet signs only the price Scrim checked", () => {
  it("never signs a larger entry the seller lists beside the checked one", async () => {
    const cheap = entry("10000", { paymentFlow: "upfront" }); // what a seller wants Scrim to check
    const costly = entry("500000000"); // what the payment library would otherwise prefer
    const required = { x402Version: 2, resource: { url: "https://seller.example/x" }, accepts: [cheap, costly] } as unknown as PaymentRequired;
    const account = privateKeyToAccount(generatePrivateKey());
    const client = new x402Client((_v, list) => list[0]).setSpendControls(false);
    registerExactEvmScheme(client, { signer: account as never, networks: ["eip155:8453" as never] });

    const payload = await client.createPaymentPayload(onlyChosen(required, cheap));
    expect((payload as { accepted: { amount: string } }).accepted.amount).toBe("10000");
    // And the flow the library would have switched to is refused outright.
    expect(payableByWallet(cheap)).toBe(false);
    expect(payableByWallet(costly)).toBe(true);
    expect(payableByWallet({ ...costly, maxTimeoutSeconds: 86_400 * 365 })).toBe(false);
  });
});

describe("transfers: the intent to sign must match the quote", () => {
  const deposit = "a".repeat(64);
  const expect_ = { signerId: "alice.near", depositAddress: deposit, assetId: "nep141:usdc.near", maxAmount: 1_000_000n, notAfter: new Date(Date.now() + 15 * 60_000) };
  const nonce = Buffer.alloc(32, 7).toString("base64");
  const message = (intents: unknown[], deadline = new Date(Date.now() + 10 * 60_000).toISOString()) => JSON.stringify({ signer_id: "alice.near", deadline, intents });
  const transfer = (receiver: string, tokens: Record<string, string>) => ({ intent: "transfer", receiver_id: receiver, tokens });

  it("accepts the quoted transfer", () => {
    expect(intentMatchesQuote({ message: message([transfer(deposit, { "nep141:usdc.near": "1000000" })]), nonce }, expect_)).toBe(true);
  });
  it("refuses any other kind of intent, a second intent or a second coin", () => {
    const ok = transfer(deposit, { "nep141:usdc.near": "1000000" });
    expect(intentMatchesQuote({ message: message([{ intent: "add_public_key", public_key: "ed25519:x" }]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([{ intent: "ft_withdraw", token: "usdc.near", receiver_id: deposit, amount: "999999999999" }]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([{ intent: "native_withdraw", receiver_id: deposit, amount: "1" }]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([ok, ok]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { "nep141:usdc.near": "1", "nep141:wrap.near": "1" })]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { "nep141:usdc.near": "0" })]), nonce }, expect_)).toBe(false);
  });
  // Found by the first real-money run: a transfer from a private balance names the coin as its private
  // token, `imt:<NEAR Intents' private treasury>:<asset>`, and the check refused a correct transfer.
  it("accepts the quoted coin named as a private-balance token, and only from NEAR Intents' treasury", () => {
    const imt = (treasury: string, asset: string) => `imt:${treasury}:${asset}`;
    expect(intentMatchesQuote({ message: message([transfer(deposit, { [imt(PRIVATE_TREASURY, "nep141:usdc.near")]: "1000000" })]), nonce }, expect_)).toBe(true);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { [imt("b".repeat(64), "nep141:usdc.near")]: "1000000" })]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { [imt(PRIVATE_TREASURY, "nep141:wrap.near")]: "1" })]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { [imt(PRIVATE_TREASURY, "nep141:usdc.near")]: "999999999999" })]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer("attacker.near", { [imt(PRIVATE_TREASURY, "nep141:usdc.near")]: "1000000" })]), nonce }, expect_)).toBe(false);
  });
  it("refuses another receiver, a bigger amount, another coin, a late deadline or a bad nonce", () => {
    expect(intentMatchesQuote({ message: message([transfer("attacker.near", { "nep141:usdc.near": "1000000" })]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { "nep141:usdc.near": "999999999999" })]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { "nep141:wrap.near": "1" })]), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { "nep141:usdc.near": "1000000" })], "2099-01-01T00:00:00Z"), nonce }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: message([transfer(deposit, { "nep141:usdc.near": "1000000" })]), nonce: "AAAA" }, expect_)).toBe(false);
    expect(intentMatchesQuote({ message: JSON.stringify({ signer_id: "mallory.near", deadline: new Date().toISOString(), intents: [] }), nonce }, expect_)).toBe(false);
  });
});

describe("amounts", () => {
  it("never reads a decimal comma as thousands", () => {
    expect(() => parseAmount("1,5")).toThrow(/dot/);
    expect(() => parseAmount("0,50")).toThrow(/dot/);
    expect(parseAmount("1,500.25")).toBe(1_500_250_000n);
    expect(parseAmount("1,000,000")).toBe(1_000_000_000_000n);
  });
});

describe("outgoing requests", () => {
  it("reach only public IPv6 addresses", () => {
    for (const internal of ["::1", "::7f00:1", "::ffff:7f00:1", "fec0::1", "fe80::1", "fc00::1", "ff02::1", "100::1", "2001:db8::1", "2002::1", "64:ff9b::1"]) expect(isPrivateAddress(internal)).toBe(true);
    for (const external of ["2606:4700:4700::1111", "2a00:1450:4001:80b::200e"]) expect(isPrivateAddress(external)).toBe(false);
  });
});

describe("proofs", () => {
  it("say who was paid", () => {
    expect(describeClaim({ type: "payment", amount: "5,000.00", symbol: "USDC", chainName: "Base", exact: true, paidAt: new Date().toISOString(), to: "0xabc" })).toBe("sent exactly 5,000.00 USDC to 0xabc on Base");
  });
});

describe("accounts and payment requests", () => {
  let session: Session;
  beforeAll(async () => {
    await resetDatabase();
    session = (await signInAs(mainnetImplicitWallet())).session;
  });
  afterAll(() => sql.end());

  it("refuses an account name that would add lines to an approver's wallet", async () => {
    await expect(createTreasury(session, { name: "Ops\nPay: 1.00 USDC", kind: "individual", signers: [], threshold: 1 })).rejects.toThrow(/letters, numbers/);
  });

  it("makes someone say yes before they become an approver on an account", async () => {
    const guest = (await signInAs(mainnetImplicitWallet())).session;
    const other = (await signInAs(mainnetImplicitWallet())).session;
    const team = await createTreasury(session, { name: "Shared", kind: "team", signers: [guest.accountId, other.accountId], threshold: 2 });
    expect(team.signers.find((s) => s.accountId === guest.accountId)?.state).toBe("invited");

    // Invited, not yet a member: the account is invisible to them and they cannot act on it.
    expect(await listTreasuries(guest)).toEqual([]);
    await expect(treasuryForMember(sql, guest.accountId, team.id, "mainnet")).rejects.toThrow(/not found/i);
    expect((await listInvitations(guest)).map((i) => i.treasuryId)).toEqual([team.id]);
    expect((await listInvitations(session)).length).toBe(0); // the owner is never "invited"

    // Only the invited person can answer, and only once.
    await expect(answerInvitation(session, team.id, true)).rejects.toThrow(/not found/i);
    await answerInvitation(guest, team.id, true);
    await expect(answerInvitation(guest, team.id, false)).rejects.toThrow(/not found/i);
    expect((await listTreasuries(guest)).map((t) => t.id)).toEqual([team.id]);
    expect((await treasuryForMember(sql, guest.accountId, team.id, "mainnet")).role).toBe("signer");

    // Declining keeps them out for good.
    await answerInvitation(other, team.id, false);
    expect(await listTreasuries(other)).toEqual([]);
    const states = Object.fromEntries((await listTreasuries(session)).find((t) => t.id === team.id)!.signers.map((s) => [s.accountId, s.state]));
    expect(states).toEqual({ [session.accountId]: "accepted", [guest.accountId]: "accepted", [other.accountId]: "declined" });
  });

  it("counts a failed purchase whose payment was signed against the agent's limits", async () => {
    const team = await createTreasury(session, { name: "Buyers", kind: "individual", signers: [], threshold: 1 });
    const { apiKey } = await createAgent(session, team.id, { name: "Shopper", perActionCap: "5", rollingCap: "20", windowHours: 24, counterparties: [{ address: "https://api.example.com", label: "Example" }] });
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    const payment = await createAgentPayment(agent, { recipient: "https://api.example.com", amount: "2", idempotencyKey: "sec-0001-signed", x402: true });
    await sql`UPDATE payment_requests SET status = 'failed' WHERE id = ${payment.id}`;
    const spent = () => sql.begin((tx) => agentSpendInWindow(tx, agent.id, 86_400));
    expect(await spent()).toBe(0n); // failed, and no money could have left
    await sql`INSERT INTO x402_purchases (request_id, url, entry, status, route, signed_at) VALUES (${payment.id}, 'https://api.example.com/x', ${sql.json({})}, 'failed', 'wallet', now())`;
    expect(await spent()).toBe(2_000_000n); // a seller's payment was signed: it counts
  });

  it("lets exactly one caller claim a wallet purchase for signing, and never after it was signed", async () => {
    const team = await createTreasury(session, { name: "Signers", kind: "individual", signers: [], threshold: 1 });
    const { apiKey } = await createAgent(session, team.id, { name: "Buyer", perActionCap: "5", rollingCap: "20", windowHours: 24, counterparties: [{ address: "https://api.example.com", label: "Example" }] });
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    const payment = await createAgentPayment(agent, { recipient: "https://api.example.com", amount: "1", idempotencyKey: "sec-0004-claim", x402: true });
    await sql`INSERT INTO x402_purchases (request_id, url, entry, status, route) VALUES (${payment.id}, 'https://api.example.com/x', ${sql.json({})}, 'requested', 'wallet')`;
    // Two overlapping steps read "requested": one wins, one gets nothing.
    expect(await Promise.all([claimForSigning(payment.id, "requested"), claimForSigning(payment.id, "requested")])).toEqual(expect.arrayContaining([true, false]));
    // Once signed, even a purchase put back to "requested" is never claimed again.
    await sql`UPDATE x402_purchases SET status = 'requested', signed_at = now() WHERE request_id = ${payment.id}`;
    expect(await claimForSigning(payment.id, "requested")).toBe(false);
    // A failed purchase is never re-signed.
    await sql`UPDATE x402_purchases SET status = 'failed', signed_at = NULL WHERE request_id = ${payment.id}`;
    expect(await claimForSigning(payment.id, "failed")).toBe(false);
  });

  it("lets only the transfer paying a request settle, fail or reopen it", async () => {
    const team = await createTreasury(session, { name: "Payouts", kind: "individual", signers: [], threshold: 1 });
    const { apiKey } = await createAgent(session, team.id, { name: "Bills", perActionCap: "5", rollingCap: "20", windowHours: 24, counterparties: [{ address: "https://api.example.com", label: "Example" }] });
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    const payment = await createAgentPayment(agent, { recipient: "https://api.example.com", amount: "1", idempotencyKey: "sec-0002-payout", x402: true });
    await sql`UPDATE payment_requests SET status = 'approved' WHERE id = ${payment.id}`;
    const [paying, stray] = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const actor = { type: "system" as const, id: "test" };
    expect(await sql.begin((tx) => markTeamRequest(tx, payment.id, "submitting", actor, ["approved"], paying))).toBe(true);
    expect(await sql.begin((tx) => markTeamRequest(tx, payment.id, "approved", actor, ["submitting"], stray))).toBe(false);
    expect(await sql.begin((tx) => markTeamRequest(tx, payment.id, "failed", actor, ["submitting"], stray))).toBe(false);
    expect(await sql.begin((tx) => markTeamRequest(tx, payment.id, "settled", actor, ["submitting"], paying))).toBe(true);
  });

  it("shows money in flight as being paid, never as expired", async () => {
    const team = await createTreasury(session, { name: "In flight", kind: "individual", signers: [], threshold: 1 });
    const { apiKey } = await createAgent(session, team.id, { name: "Late", perActionCap: "5", rollingCap: "20", windowHours: 24, counterparties: [{ address: "https://api.example.com", label: "Example" }] });
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    const payment = await createAgentPayment(agent, { recipient: "https://api.example.com", amount: "1", idempotencyKey: "sec-0003-flight", x402: true });
    await sql`UPDATE payment_requests SET status = 'submitting', expires_at = now() - interval '1 day' WHERE id = ${payment.id}`;
    expect((await getPayment(session, payment.id)).status).toBe("submitting");
    await sql`UPDATE payment_requests SET status = 'awaiting_approval' WHERE id = ${payment.id}`;
    expect((await getPayment(session, payment.id)).status).toBe("expired");
  });
});
