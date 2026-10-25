// Agents that pay by themselves, from their own OutLayer wallet.
//
// The owner creates the agent's wallet here, sets its spending policy on OutLayer with their NEAR wallet
// (enforced inside the enclave), funds it, and then may switch the agent to "pays by itself". From then on
// a request that passes Scrim's limits is paid straight from the agent's wallet, with no approval step.
// A request Scrim's limits refuse is stopped as before; OutLayer's policy is a second, independent guard.
import { after } from "next/server";
import { formatAmount } from "@/protocol/amount";
import type { Network } from "@/protocol/networks";
import { audit } from "./audit";
import type { Session } from "./auth";
import { sql } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { finalTransaction } from "./near-rpc";
import { emitPaymentEvent } from "./notify";
import * as outlayer from "./outlayer";
import { markTeamRequest } from "./payments";
import { open, seal } from "./secrets";
import { requireOwner, treasuryForMember } from "./treasuries";

type Secret = { apiKey: string; handoffUrl: string };
const aad = (agentId: string) => `agent-wallet:${agentId}`;

type WalletRow = { agent_id: string; network: Network; wallet_id: string; account_id: string; secret_sealed: string; private: boolean };
// Private balances exist on mainnet only.
const isPrivate = (row: { network: Network; private: boolean }) => row.network === "mainnet" && row.private;

async function agentTeam(session: Session, agentId: string) {
  const [agent] = await sql<{ treasury_id: string; mode: string; name: string }[]>`SELECT treasury_id, mode, name FROM agents WHERE id = ${agentId}`;
  if (!agent) throw notFound("Agent not found.");
  const { role, treasury } = await treasuryForMember(sql, session.accountId, agent.treasury_id, session.network);
  return { agent, role, treasury };
}

export type AgentWalletView = {
  network: Network;
  accountId: string;
  autonomous: boolean;
  private: boolean; // pays from its private balance (mainnet)
  policyUrl: string | null; // owner only: it carries the wallet's key
  fundUrl: string;
  balances: { near: string | null; usdc: string | null; usdcIntents: string | null; usdcPrivate: string | null };
};

export async function createAgentWallet(session: Session, agentId: string): Promise<AgentWalletView> {
  const { role, treasury, agent } = await agentTeam(session, agentId);
  requireOwner(role);
  const [existing] = await sql`SELECT 1 FROM agent_wallets WHERE agent_id = ${agentId}`;
  if (existing) throw conflict("This agent already has a wallet.");
  const reg = await outlayer.register(treasury.network);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO agent_wallets (agent_id, network, wallet_id, account_id, secret_sealed, created_by)
      VALUES (${agentId}, ${treasury.network}, ${reg.wallet_id}, ${reg.near_account_id}, ${seal({ apiKey: reg.api_key, handoffUrl: reg.handoff_url } satisfies Secret, aad(agentId))}, ${session.accountId})`;
    await audit(tx, treasury.id, { type: "human", id: session.accountId }, "agent.wallet_created", agentId, { account: reg.near_account_id, network: treasury.network, name: agent.name });
  });
  return agentWallet(session, agentId) as Promise<AgentWalletView>;
}

async function walletRow(agentId: string) {
  const [row] = await sql<WalletRow[]>`SELECT agent_id, network, wallet_id, account_id, secret_sealed, private FROM agent_wallets WHERE agent_id = ${agentId}`;
  return row ? { ...row, secret: open<Secret>(row.secret_sealed, aad(agentId)) } : null;
}

export async function agentWallet(session: Session, agentId: string): Promise<AgentWalletView | null> {
  const { role, agent } = await agentTeam(session, agentId);
  const row = await walletRow(agentId);
  if (!row) return null;
  const key = row.secret.apiKey;
  const read = (q: Parameters<typeof outlayer.balance>[2]) => outlayer.balance(row.network, key, q).then((b) => b.balance).catch(() => null);
  const mainnet = row.network === "mainnet";
  const [near, usdc, usdcIntents, usdcPrivate] = await Promise.all([
    read({ chain: "near" }),
    read({ chain: "near", token: outlayer.USDC[row.network] }),
    mainnet ? read({ token: outlayer.USDC.mainnet, source: "intents" }) : Promise.resolve(null),
    mainnet ? outlayer.privateBalance("mainnet", key, `nep141:${outlayer.USDC.mainnet}`).then((b) => b.balance ?? "0").catch(() => null) : Promise.resolve(null),
  ]);
  return {
    network: row.network,
    accountId: row.account_id,
    autonomous: agent.mode === "autonomous",
    private: isPrivate(row),
    policyUrl: role === "owner" ? row.secret.handoffUrl : null,
    fundUrl: outlayer.fundUrl(row.network, row.account_id, `Fund ${agent.name}`),
    balances: {
      near: near === null ? null : formatAmount(BigInt(near), 24, 2),
      usdc: usdc === null ? null : formatAmount(BigInt(usdc), 6, 2),
      usdcIntents: usdcIntents === null ? null : formatAmount(BigInt(usdcIntents), 6, 2),
      usdcPrivate: usdcPrivate === null ? null : formatAmount(BigInt(usdcPrivate), 6, 2),
    },
  };
}

// Only the owner, and only once the agent has its own wallet.
export async function setAutonomous(session: Session, agentId: string, on: boolean) {
  const { role, treasury } = await agentTeam(session, agentId);
  requireOwner(role);
  if (on && !(await walletRow(agentId))) throw badRequest("Give the agent its own wallet first.");
  await sql.begin(async (tx) => {
    await tx`UPDATE agents SET mode = ${on ? "autonomous" : "request_only"} WHERE id = ${agentId}`;
    await audit(tx, treasury.id, { type: "human", id: session.accountId }, on ? "agent.autonomous_on" : "agent.autonomous_off", agentId);
  });
}

// Mainnet only: pay from the private balance (default) or the public one.
export async function setWalletPrivate(session: Session, agentId: string, on: boolean) {
  const { role, treasury } = await agentTeam(session, agentId);
  requireOwner(role);
  const row = await walletRow(agentId);
  if (!row) throw badRequest("Give the agent its own wallet first.");
  if (row.network !== "mainnet") throw badRequest("Private balances are available on mainnet.");
  await sql.begin(async (tx) => {
    await tx`UPDATE agent_wallets SET private = ${on} WHERE agent_id = ${agentId}`;
    await audit(tx, treasury.id, { type: "human", id: session.accountId }, on ? "agent.wallet_private" : "agent.wallet_public", agentId);
  });
}

// An address on another chain that funds the agent's private balance without linking its wallet.
export async function privateFundingAddress(session: Session, agentId: string, chain: string, amount: string) {
  const { role } = await agentTeam(session, agentId);
  requireOwner(role);
  const row = await walletRow(agentId);
  if (!row || row.network !== "mainnet") throw badRequest("Private funding is available for mainnet agent wallets.");
  if (!/^(base|ethereum|arbitrum|solana|near)$/.test(chain)) throw badRequest("Choose Base, Ethereum, Arbitrum, Solana or NEAR.");
  if (!/^\d+(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) throw badRequest("Enter an amount like 25 or 25.50.");
  const minor = (BigInt(Math.round(Number(amount) * 1e6))).toString();
  const quote = await outlayer.privateDepositAddress("mainnet", row.secret.apiKey, chain, minor);
  return { chain, address: quote.deposit_address, amount, expiresAt: quote.expires_at ?? null };
}

/* ── Paying by itself ─────────────────────────────────────────────────── */

// Runs after the response, so an agent's request returns at once.
export function scheduleAutoPay(requestId: string) {
  const job = () => autoPay(requestId).catch((error) => console.error("[agent-wallet] auto-pay", requestId, error));
  try {
    after(job);
  } catch {
    void job();
  }
}

type RequestRow = { id: string; treasury_id: string; network: Network; agent_id: string; recipient: string; amount: string; status: string };

async function autoPay(requestId: string) {
  const [req] = await sql<RequestRow[]>`
    SELECT p.id, p.treasury_id, t.network, p.agent_id, p.recipient, p.amount::text AS amount, p.status
    FROM payment_requests p JOIN treasuries t ON t.id = p.treasury_id JOIN agents a ON a.id = p.agent_id
    WHERE p.id = ${requestId} AND a.mode = 'autonomous' AND a.enabled`;
  if (!req || req.status !== "awaiting_approval") return;
  const wallet = await walletRow(req.agent_id);
  if (!wallet || wallet.network !== req.network) return;

  // Claim it: one auto-pay per request, and record that the agent's limits approved it.
  const claimed = await sql.begin(async (tx) => {
    const moved = await tx`UPDATE payment_requests SET status = 'submitting', updated_at = now() WHERE id = ${requestId} AND status = 'awaiting_approval' RETURNING id`;
    if (moved.length !== 1) return false;
    await tx`INSERT INTO agent_payouts (request_id, agent_id, status) VALUES (${requestId}, ${req.agent_id}, 'sending')`;
    await audit(tx, req.treasury_id, { type: "agent", id: req.agent_id }, "payment.auto_approved", requestId, { wallet: wallet.account_id });
    return true;
  });
  if (!claimed) return;
  emitPaymentEvent(requestId, "payment.submitting");

  try {
    const x402 = await import("./x402-client");
    if (await x402.purchaseFor(requestId)) {
      // An x402 purchase: quote with the seller, then pay its deposit address from the agent's wallet.
      const sent = await x402.payPurchaseFromWallet(requestId, wallet.network, wallet.secret.apiKey, isPrivate(wallet));
      await recordSent(requestId, sent);
    } else if (wallet.network === "testnet") {
      const sent = await outlayer.transferNear("testnet", wallet.secret.apiKey, req.recipient, req.amount, `scrim-${requestId}`);
      await recordSent(requestId, sent);
    } else {
      // Mainnet team payouts go to an address on Base, in USDC, gasless from the agent's private (or public) balance.
      const send = isPrivate(wallet) ? outlayer.privateWithdraw : outlayer.withdraw;
      const sent = await send("mainnet", wallet.secret.apiKey, { to: req.recipient, amount: req.amount, token: `nep141:${outlayer.USDC.mainnet}`, chain: "base" }, `scrim-${requestId}`);
      await recordSent(requestId, sent);
    }
    await syncAgentPayout(requestId);
  } catch (error) {
    await finish(requestId, "failed", (error as Error).message);
  }
}

async function recordSent(requestId: string, sent: outlayer.WalletRequest) {
  await sql`UPDATE agent_payouts SET wallet_request_id = ${sent.request_id ?? null}, tx_hash = ${sent.tx_hash ?? sent.result?.tx_hash ?? null}, updated_at = now() WHERE request_id = ${requestId}`;
  if (sent.status === "failed") await finish(requestId, "failed", sent.result?.reason ?? sent.error ?? "The wallet couldn't send it.");
  if (sent.status === "needs_review") await finish(requestId, "needs_review", "The wallet couldn't confirm whether it was sent. Check before trying again.");
}

async function finish(requestId: string, status: "success" | "failed" | "needs_review", error?: string) {
  const outcome = status === "success" ? "settled" : "failed";
  const moved = await sql.begin(async (tx) => {
    await tx`UPDATE agent_payouts SET status = ${status}, error = ${error ?? null}, updated_at = now() WHERE request_id = ${requestId}`;
    return markTeamRequest(tx, requestId, outcome, { type: "system", id: "agent-wallet" }, ["submitting"]);
  });
  if (moved) emitPaymentEvent(requestId, `payment.${outcome}`);
}

// Checks a payment the agent's wallet is still sending. Safe to call repeatedly.
export async function syncAgentPayout(requestId: string) {
  const [payout] = await sql<{ status: string; wallet_request_id: string | null; tx_hash: string | null; agent_id: string }[]>`
    SELECT status, wallet_request_id, tx_hash, agent_id FROM agent_payouts WHERE request_id = ${requestId}`;
  if (!payout || payout.status !== "sending") return;
  const wallet = await walletRow(payout.agent_id);
  if (!wallet) return;

  if (wallet.network === "testnet" && payout.tx_hash) {
    // Read the transfer back from the chain before calling it paid.
    const outcome = await finalTransaction("testnet", payout.tx_hash, wallet.account_id).catch(() => null);
    if (!outcome) return;
    if (outcome.status.Failure) return finish(requestId, "failed", "The transfer failed on chain.");
    return finish(requestId, "success");
  }
  if (!payout.wallet_request_id) return;
  const state = await outlayer.request(wallet.network, wallet.secret.apiKey, payout.wallet_request_id).catch(() => null);
  if (!state || state.status === "processing" || state.status === "pending_approval" || state.status === "pending_deposit") return;
  const destinationTx = outlayer.deliveryHash(state);
  if (destinationTx) await sql`UPDATE agent_payouts SET tx_hash = ${destinationTx} WHERE request_id = ${requestId}`;
  if (state.status === "success") {
    const x402 = await import("./x402-client");
    if (await x402.purchaseFor(requestId)) {
      if (!destinationTx) return; // the delivery hash arrives a little after success
      await finish(requestId, "success");
      await x402.deliverPurchase(requestId, destinationTx);
      return;
    }
    return finish(requestId, "success");
  }
  return finish(requestId, state.status === "needs_review" ? "needs_review" : "failed", state.result?.reason ?? state.result?.swap_details?.refundReason ?? state.error ?? (state.status === "refunded" ? "It couldn't be delivered, so the money went back to the agent's wallet." : "The wallet couldn't send it."));
}
