// OutLayer Agent Custody: a wallet for each agent whose key exists only inside OutLayer's Intel TDX
// enclaves (derived from the NEAR MPC network). The owner sets the agent's spending policy on-chain at
// app.outlayer.ai with their NEAR wallet; the enclave checks it before every signature. Scrim keeps
// only the wallet's API key, sealed, and calls it within the limits the owner set in Scrim.
// Docs: https://skills.outlayer.ai/agent-custody/SKILL.md
import type { Network } from "@/protocol/networks";
import { HttpError } from "./errors";

const BASE: Record<Network, string> = { mainnet: "https://api.outlayer.ai", testnet: "https://testnet-api.outlayer.ai" };
const DASHBOARD = "https://app.outlayer.ai";
// What OutLayer pays and is paid in on each network.
export const USDC: Record<Network, string> = { mainnet: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", testnet: "usdc.fakes.testnet" };

type Init = { method?: "GET" | "POST"; body?: unknown; apiKey?: string; idempotencyKey?: string; answerWithin?: number };

async function call<T>(network: Network, path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.apiKey) headers.authorization = `Bearer ${init.apiKey}`;
  if (init.idempotencyKey) headers["x-idempotency-key"] = init.idempotencyKey;
  if (init.answerWithin !== undefined) headers["x-answer-within"] = String(init.answerWithin);
  let response: Response;
  try {
    response = await fetch(`${BASE[network]}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HttpError(503, "upstream", "The agent wallet service is not responding. Try again in a moment.");
  }
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!response.ok) {
    const reason = payload.error ?? `status ${response.status}`;
    const friendly: Record<string, string> = {
      policy_denied: "The agent's wallet policy refused this payment.",
      insufficient_balance: "The agent's wallet doesn't have enough funds.",
      wallet_frozen: "The agent's wallet is frozen.",
      operation_limit_reached: "The agent's wallet reached its daily limit of operations.",
    };
    throw new HttpError(response.status === 429 ? 429 : response.status >= 500 ? 503 : 400, "agent_wallet", friendly[reason] ?? payload.message ?? `The agent wallet refused this (${reason}).`);
  }
  return payload;
}

export type Registration = { api_key: string; wallet_id: string; near_account_id: string; handoff_url: string };

// A new wallet. No signature or transaction: the network is chosen by the host.
export const register = (network: Network) => call<Registration>(network, "/register", { method: "POST" });

export const balance = (network: Network, apiKey: string, query: { chain?: string; token?: string; source?: "intents" }) =>
  call<{ balance: string; token: string; account_id: string }>(network, `/wallet/v1/balance?${new URLSearchParams(query as Record<string, string>)}`, { apiKey });

export const address = (network: Network, apiKey: string, chain: string) =>
  call<{ address: string; chain: string; public_key?: string }>(network, `/wallet/v1/address?chain=${encodeURIComponent(chain)}`, { apiKey });

export type WalletRequest = {
  request_id?: string;
  status: "success" | "failed" | "processing" | "pending_approval" | "pending_deposit" | "needs_review" | "refunded";
  tx_hash?: string;
  poll_url?: string;
  error?: string;
  result?: {
    destination_tx_hash?: string | null; reason?: string; never_executed?: boolean; never_submitted?: boolean; tx_hash?: string;
    swap_details?: { destinationChainTxHashes?: string[]; refundReason?: string };
  };
};

// Native NEAR transfer, signed in the enclave and broadcast on chain (needs a little NEAR for gas).
export const transferNear = (network: Network, apiKey: string, to: string, yocto: string, idempotencyKey: string) =>
  call<WalletRequest>(network, "/wallet/v1/transfer", { apiKey, idempotencyKey, body: { chain: "near", to, amount: yocto } });

// Gasless withdrawal from the agent's NEAR Intents balance, to NEAR or another chain (mainnet only).
export const withdraw = (network: Network, apiKey: string, body: { to: string; amount: string; token: string; chain: string }, idempotencyKey: string) =>
  call<WalletRequest>(network, "/wallet/v1/intents/withdraw", { apiKey, idempotencyKey, answerWithin: 20, body: { ...body, async: body.chain !== "near" } });

// The same withdrawal from the wallet's private balance: the wallet never appears on the public chain,
// only the delivery to the recipient does. Mainnet only; answers 503 where it isn't offered.
export const privateWithdraw = (network: Network, apiKey: string, body: { to: string; amount: string; token: string; chain: string }, idempotencyKey: string) =>
  call<WalletRequest>(network, "/wallet/v1/confidential/withdraw", { apiKey, idempotencyKey, body });

export const privateBalance = (network: Network, apiKey: string, token: string) =>
  call<{ balance: string }>(network, `/wallet/v1/confidential/balance?token=${encodeURIComponent(token)}`, { apiKey });

// An address on another chain that credits the wallet's private balance directly, so funding it never
// links the wallet on the public chain. USDC from any chain arrives as NEAR USDC.
export const privateDepositAddress = (network: Network, apiKey: string, chain: string, amount: string) =>
  call<{ deposit_address: string; amount: string; amount_out?: string; expires_at?: string }>(network, "/wallet/v1/confidential/deposit/cross-chain", { apiKey, body: { chain, token: "USDC", amount } });

// Where a finished withdrawal landed on the recipient's chain.
export const deliveryHash = (r: WalletRequest) => r.result?.destination_tx_hash ?? r.result?.swap_details?.destinationChainTxHashes?.[0] ?? null;

export const request = (network: Network, apiKey: string, id: string) => call<WalletRequest>(network, `/wallet/v1/requests/${encodeURIComponent(id)}`, { apiKey });

// The link the owner opens to fund the agent (the policy link comes with the wallet at registration).
export const fundUrl = (network: Network, accountId: string, message: string) =>
  `${DASHBOARD}/wallet/fund?${new URLSearchParams({ to: accountId, token: USDC[network], msg: message, ...(network === "mainnet" ? { dest: "intents" } : {}) })}`;
