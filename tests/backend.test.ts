import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { agentFromApiKey, createAgent, setAgentEnabled, updateMandate } from "@/server/agents";
import { createSignInChallenge, sessionFromToken, signIn, type Session } from "@/server/auth";
import { sql } from "@/server/db";
import { setKeyVerifierForTests } from "@/server/near-rpc";
import { approvePayment, cancelPayment, createAgentPayment, createApprovalChallenge, createHumanPayment, listAudit, requestQuote } from "@/server/payments";
import { setQuoteProviderForTests } from "@/server/settlement";
import { createTreasury, listTreasuries } from "@/server/treasuries";
import { resetDatabase, wallet, type Wallet } from "./helpers";

const VENDOR = "0x1111111111111111111111111111111111111111";
const STRANGER = "0x9999999999999999999999999999999999999999";
const registeredKeys = new Map<string, string>();

beforeAll(async () => {
  await resetDatabase();
  setKeyVerifierForTests(async (accountId, publicKey) => registeredKeys.get(accountId) === publicKey);
  setQuoteProviderForTests(async ({ amount, requestId }) => ({
    provider: "near-intents-1click",
    confidentiality: "public",
    amountIn: amount + 250_000n,
    amountOut: amount,
    minAmountOut: amount,
    timeEstimateSeconds: 22,
    deadline: new Date(Date.now() + 1_800_000),
    quoteCommitment: `test-${requestId}`,
    raw: {},
  }));
});
afterAll(async () => {
  setKeyVerifierForTests(null);
  setQuoteProviderForTests(null);
  await sql.end();
});

function account(id: string): Wallet {
  const w = wallet(id);
  registeredKeys.set(id, w.publicKey);
  return w;
}

async function login(w: Wallet): Promise<Session> {
  const { token } = await signIn(w.sign(await createSignInChallenge()));
  return (await sessionFromToken(token))!;
}

describe("wallet sign-in", () => {
  it("creates a session from a valid NEP-413 signature", async () => {
    const alice = account("alice.testnet");
    const { token, session } = await signIn(alice.sign(await createSignInChallenge()));
    expect(session.accountId).toBe("alice.testnet");
    expect((await sessionFromToken(token))?.accountId).toBe("alice.testnet");
    expect(await sessionFromToken("not-a-token")).toBeNull();
  });

  it("rejects a replayed challenge", async () => {
    const bob = account("bob.testnet");
    const envelope = bob.sign(await createSignInChallenge());
    await signIn(envelope);
    await expect(signIn(envelope)).rejects.toThrow(/expired or was already used/);
  });

  it("rejects a signature claimed for another account", async () => {
    account("victim.testnet");
    const mallory = wallet("mallory.testnet");
    const envelope = { ...mallory.sign(await createSignInChallenge()), accountId: "victim.testnet" };
    await expect(signIn(envelope)).rejects.toThrow(/not a full-access key/);
  });

  it("rejects a tampered signature", async () => {
    const carol = account("carol.testnet");
    const envelope = carol.sign(await createSignInChallenge());
    const forged = { ...envelope, signature: Buffer.alloc(64, 1).toString("base64") };
    await expect(signIn(forged)).rejects.toThrow(/Signature verification failed/);
  });
});

describe("treasury, mandate, and approval flow", () => {
  let owner: Wallet, cosigner: Wallet, ownerSession: Session, cosignerSession: Session;

  beforeEach(async () => {
    owner = account(`owner-${Math.random().toString(36).slice(2, 8)}.testnet`);
    cosigner = account(`cosigner-${Math.random().toString(36).slice(2, 8)}.testnet`);
    ownerSession = await login(owner);
    cosignerSession = await login(cosigner);
  });

  async function teamTreasury() {
    return createTreasury(ownerSession, { name: "Ops", kind: "team", signers: [cosigner.accountId], threshold: 2 });
  }

  async function agentFor(treasuryId: string) {
    return createAgent(ownerSession, treasuryId, {
      name: "Procurement agent",
      perActionCap: "500",
      rollingCap: "800",
      windowHours: 24,
      counterparties: [{ address: VENDOR, label: "Compute vendor" }],
    });
  }

  it("creates a 2-of-2 team treasury visible to both signers", async () => {
    const treasury = await teamTreasury();
    expect(treasury.thresholdRequired).toBe(2);
    expect((await listTreasuries(cosignerSession)).map((t) => t.id)).toContain(treasury.id);
  });

  it("rejects an invalid threshold", async () => {
    await expect(createTreasury(ownerSession, { name: "x", kind: "team", signers: [cosigner.accountId], threshold: 3 })).rejects.toThrow(/between 1 and 2/);
  });

  it("only lets the owner create an agent", async () => {
    const treasury = await teamTreasury();
    await expect(
      createAgent(cosignerSession, treasury.id, { name: "x", perActionCap: "1", rollingCap: "1", windowHours: 1, counterparties: [{ address: VENDOR, label: "" }] }),
    ).rejects.toThrow(/Only the treasury owner/);
  });

  it("authenticates agents by API key and enforces the mandate", async () => {
    const treasury = await teamTreasury();
    const { apiKey, agent } = await agentFor(treasury.id);
    const authed = await agentFromApiKey(`Bearer ${apiKey}`);
    expect(authed.id).toBe(agent.id);
    await expect(agentFromApiKey("Bearer scrim_sk_wrong")).rejects.toThrow(/Unknown agent key/);

    const ok = await createAgentPayment(authed, { recipient: VENDOR, amount: "400", idempotencyKey: "req-000001" });
    expect(ok.status).toBe("awaiting_approval");
    expect(ok.policyDecision?.allowed).toBe(true);

    const overCap = await createAgentPayment(authed, { recipient: VENDOR, amount: "501", idempotencyKey: "req-000002" });
    expect(overCap.status).toBe("policy_rejected");

    const stranger = await createAgentPayment(authed, { recipient: STRANGER, amount: "10", idempotencyKey: "req-000003" });
    expect(stranger.policyDecision?.checks.find((c) => c.rule === "counterparty")?.passed).toBe(false);

    // 400 already committed in the window; 401 more would breach the 800 rolling cap.
    const rolling = await createAgentPayment(authed, { recipient: VENDOR, amount: "401", idempotencyKey: "req-000004" });
    expect(rolling.status).toBe("policy_rejected");
    expect(rolling.policyDecision?.checks.find((c) => c.rule === "rolling_cap")?.passed).toBe(false);
  });

  it("serializes concurrent agent requests against the rolling cap", async () => {
    const treasury = await teamTreasury();
    const { agent } = await agentFor(treasury.id);
    const results = await Promise.all(
      [1, 2, 3].map((i) => createAgentPayment(agent, { recipient: VENDOR, amount: "300", idempotencyKey: `burst-00${i}` })),
    );
    expect(results.filter((p) => p.status === "awaiting_approval")).toHaveLength(2);
    expect(results.filter((p) => p.status === "policy_rejected")).toHaveLength(1);
  });

  it("is idempotent and rejects key reuse for a different request", async () => {
    const treasury = await teamTreasury();
    const { agent } = await agentFor(treasury.id);
    const a = await createAgentPayment(agent, { recipient: VENDOR, amount: "10", idempotencyKey: "same-key-1" });
    const b = await createAgentPayment(agent, { recipient: VENDOR, amount: "10", idempotencyKey: "same-key-1" });
    expect(b.id).toBe(a.id);
    await expect(createAgentPayment(agent, { recipient: VENDOR, amount: "11", idempotencyKey: "same-key-1" })).rejects.toThrow(/different request/);
  });

  it("blocks paused agents and versions mandate changes", async () => {
    const treasury = await teamTreasury();
    const { agent } = await agentFor(treasury.id);
    await setAgentEnabled(cosignerSession, agent.id, false); // any signer can pause
    const paused = await createAgentPayment(agent, { recipient: VENDOR, amount: "10", idempotencyKey: "paused-01" });
    expect(paused.status).toBe("policy_rejected");
    await expect(setAgentEnabled(cosignerSession, agent.id, true)).rejects.toThrow(/Only the treasury owner/);

    const updated = await updateMandate(ownerSession, agent.id, {
      perActionCap: "50",
      rollingCap: "100",
      windowHours: 1,
      counterparties: [{ address: VENDOR, label: "Vendor" }],
    });
    expect(updated.policy.version).toBe(2);
    expect(updated.policyCommitment).not.toBe(agent.policyCommitment);
  });

  it("requires threshold wallet approvals before quoting", async () => {
    const treasury = await teamTreasury();
    const payment = await createHumanPayment(ownerSession, treasury.id, { recipient: VENDOR, amount: "120.5", memo: "Invoice 1048", idempotencyKey: "human-0001" });
    expect(payment.status).toBe("awaiting_approval");
    await expect(requestQuote(ownerSession, payment.id)).rejects.toThrow(/needs its approvals/);

    const ownerChallenge = await createApprovalChallenge(ownerSession, payment.id);
    expect(ownerChallenge.message).toContain("120.50 USDC");
    expect(ownerChallenge.message).toContain(VENDOR);
    const first = await approvePayment(ownerSession, payment.id, owner.sign(ownerChallenge));
    expect(first.status).toBe("awaiting_approval");
    await expect(createApprovalChallenge(ownerSession, payment.id)).rejects.toThrow(/already approved/);

    // A cosigner cannot use a challenge issued to another session.
    const stolen = await createApprovalChallenge(cosignerSession, payment.id);
    await expect(approvePayment(ownerSession, payment.id, owner.sign(stolen))).rejects.toThrow();

    const second = await approvePayment(cosignerSession, payment.id, cosigner.sign(await createApprovalChallenge(cosignerSession, payment.id)));
    expect(second.status).toBe("approved");
    expect(second.approvals).toHaveLength(2);

    const quoted = await requestQuote(ownerSession, payment.id);
    expect(quoted.status).toBe("quoted");
    expect(quoted.quote?.amountOut).toBe("120500000");

    const trail = await listAudit(ownerSession, treasury.id);
    expect(trail.map((e) => e.action)).toEqual(expect.arrayContaining(["treasury.created", "payment.requested", "payment.approved", "payment.quoted"]));
  });

  it("rejects an approval signature for a different request", async () => {
    const treasury = await teamTreasury();
    const p1 = await createHumanPayment(ownerSession, treasury.id, { recipient: VENDOR, amount: "1", idempotencyKey: "swap-00001" });
    const p2 = await createHumanPayment(ownerSession, treasury.id, { recipient: VENDOR, amount: "9999", idempotencyKey: "swap-00002" });
    const challenge = await createApprovalChallenge(ownerSession, p1.id);
    await expect(approvePayment(ownerSession, p2.id, owner.sign(challenge))).rejects.toThrow(/does not match this request/);
  });

  it("hides treasuries and payments from non-members", async () => {
    const treasury = await teamTreasury();
    const payment = await createHumanPayment(ownerSession, treasury.id, { recipient: VENDOR, amount: "5", idempotencyKey: "hidden-001" });
    const outsider = await login(account("outsider.testnet"));
    await expect(createHumanPayment(outsider, treasury.id, { recipient: VENDOR, amount: "5", idempotencyKey: "hidden-002" })).rejects.toThrow(/not found/);
    await expect(cancelPayment(outsider, payment.id)).rejects.toThrow(/not found/);
  });
});
