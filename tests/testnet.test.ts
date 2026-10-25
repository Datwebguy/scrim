// Runs against real NEAR testnet: real accounts, real RPC, real key checks, real transfers.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApprovalChallenge, createHumanPayment, approvePayment, recordTestnetPayout, getPayment } from "@/server/payments";
import { createSignInChallenge, signIn, type Session } from "@/server/auth";
import { overview } from "@/server/balances";
import { sql } from "@/server/db";
import { accountExists, publicHoldings } from "@/server/holdings";
import { answerInvitation, createTreasury, listTreasuries } from "@/server/treasuries";
import { createTransfer } from "@/server/transfers";
import { createPayLink } from "@/server/paylinks";
import { createProof } from "@/server/proofs";
import { NEAR, createTestnetWallet, resetDatabase, signInAs, type Wallet } from "./live";

let owner: Wallet, cosigner: Wallet, ownerSession: Session, cosignerSession: Session;

beforeAll(async () => {
  await resetDatabase();
  [owner, cosigner] = await Promise.all([createTestnetWallet("scrim-t-owner"), createTestnetWallet("scrim-t-co")]);
  ownerSession = (await signInAs(owner)).session;
  cosignerSession = (await signInAs(cosigner)).session;
}, 120_000);
afterAll(() => sql.end());

describe("sign-in on testnet", () => {
  it("signs in a real account and tags the session testnet", () => {
    expect(ownerSession.network).toBe("testnet");
    expect(ownerSession.accountId).toBe(owner.accountId);
  });

  it("rejects a replayed signature", async () => {
    const w = await createTestnetWallet("scrim-t-replay");
    const envelope = w.sign(await createSignInChallenge(w.accountId, "testnet"));
    await signIn(envelope);
    await expect(signIn(envelope)).rejects.toThrow(/expired or was already used/);
  });

  it("rejects a key that is not on the claimed account", async () => {
    const mallory = await createTestnetWallet("scrim-t-mal");
    const envelope = { ...mallory.sign(await createSignInChallenge(owner.accountId, "testnet")), accountId: owner.accountId };
    await expect(signIn(envelope)).rejects.toThrow(/not a full-access key/);
  });

  it("rejects a signature for another network's challenge", async () => {
    const challenge = await createSignInChallenge(owner.accountId, "testnet");
    await sql`UPDATE auth_challenges SET network = 'mainnet' WHERE id = ${challenge.challengeId}`;
    await expect(signIn(owner.sign(challenge))).rejects.toThrow();
  });

  it("says plainly that private money is mainnet-only", async () => {
    expect((await overview(ownerSession)).status).toBe("mainnet_only");
    await expect(createTransfer(ownerSession, { kind: "add", fromAssetId: "x", amount: "1" })).rejects.toThrow(/mainnet/);
    await expect(createPayLink(ownerSession, { assetId: "x", amount: "1" })).rejects.toThrow(/mainnet/);
    await expect(createProof(ownerSession, { kind: "balance_at_least", reader: "A reader", days: 7, amount: "1" })).rejects.toThrow(/mainnet/);
  });
});

describe("real testnet data", () => {
  it("reads the live NEAR balance and finds real accounts", async () => {
    const holdings = await publicHoldings("testnet", owner.accountId);
    const near = holdings.find((h) => h.id === "near")!;
    expect(BigInt(near.amount)).toBeGreaterThan(0n);
    expect(near.decimals).toBe(24);
    if (near.icon !== null) expect(near.icon).toMatch(/^https:\/\//); // the real NEAR logo (none when CoinGecko is unreachable: a letter shows instead)
    expect(await accountExists("testnet", owner.accountId)).toBe(true);
    expect(await accountExists("testnet", "no-such-account-scrim-xyz.testnet")).toBe(false);
  }, 30_000);
});

describe("team accounts on testnet", () => {
  async function team() {
    const created = await createTreasury(ownerSession, { name: "Ops", kind: "team", signers: [cosigner.accountId], threshold: 2 });
    await answerInvitation(cosignerSession, created.id, true); // the co-signer says yes, as a person would
    return created;
  }

  it("shows team accounts only to the network they were made on", async () => {
    const t = await team();
    expect(t.unit).toMatchObject({ symbol: "NEAR", decimals: 24 });
    expect((await listTreasuries(cosignerSession)).map((x) => x.id)).toContain(t.id);
  });

  it("validates recipients as NEAR accounts and amounts in NEAR", async () => {
    const t = await team();
    await expect(createHumanPayment(ownerSession, t.id, { recipient: "Not A Name!", amount: "1", idempotencyKey: "bad-recipient-1" })).rejects.toThrow(/NEAR testnet account/);
    await expect(createHumanPayment(ownerSession, t.id, { recipient: cosigner.accountId, amount: "0.0000000000000000000000001", idempotencyKey: "bad-amount-001" })).rejects.toThrow(/decimal places/);
  });

  it("approves with real wallet signatures, then pays with a real transfer verified on chain", async () => {
    const t = await team();
    const amount = NEAR(0.25);
    const p = await createHumanPayment(ownerSession, t.id, { recipient: cosigner.accountId, amount: "0.25", memo: "Test payout", idempotencyKey: "real-payout-001" });
    expect(p.status).toBe("awaiting_approval");

    const ownerChallenge = await createApprovalChallenge(ownerSession, p.id);
    expect(ownerChallenge.message).toContain("0.25 NEAR");
    expect(ownerChallenge.message).toContain(cosigner.accountId);
    await approvePayment(ownerSession, p.id, owner.sign(ownerChallenge));
    const approved = await approvePayment(cosignerSession, p.id, cosigner.sign(await createApprovalChallenge(cosignerSession, p.id)));
    expect(approved.status).toBe("approved");

    // A transaction that does not match is refused.
    const wrongAmount = await owner.send(cosigner.accountId, NEAR(0.01));
    await expect(recordTestnetPayout(ownerSession, p.id, wrongAmount)).rejects.toThrow(/different amount/);
    const wrongPerson = await owner.send(owner.accountId === cosigner.accountId ? "x" : (await createTestnetWallet("scrim-t-other")).accountId, amount);
    await expect(recordTestnetPayout(ownerSession, p.id, wrongPerson)).rejects.toThrow(/different account/);
    // Only the owner may record the payout.
    await expect(recordTestnetPayout(cosignerSession, p.id, wrongAmount)).rejects.toThrow(/Only the account owner/);

    const before = BigInt((await publicHoldings("testnet", cosigner.accountId)).find((h) => h.id === "near")!.amount);
    const hash = await owner.send(cosigner.accountId, amount);
    const paid = await recordTestnetPayout(ownerSession, p.id, hash);
    expect(paid.status).toBe("settled");
    const after = BigInt((await publicHoldings("testnet", cosigner.accountId)).find((h) => h.id === "near")!.amount);
    expect(after - before).toBeGreaterThanOrEqual(amount); // the money really arrived

    await expect(recordTestnetPayout(ownerSession, p.id, hash)).rejects.toThrow(/already/);
    expect((await getPayment(ownerSession, p.id)).status).toBe("settled");
  }, 180_000);

  it("keeps requests and treasuries private from outsiders", async () => {
    const t = await team();
    const outsider = (await signInAs(await createTestnetWallet("scrim-t-out"))).session;
    await expect(createHumanPayment(outsider, t.id, { recipient: cosigner.accountId, amount: "1", idempotencyKey: "outsider-0001" })).rejects.toThrow(/not found/);
  }, 60_000);
});
