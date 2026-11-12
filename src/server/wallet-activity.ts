// The connected wallet's own public transactions, read from FastNEAR's transaction index and shown in
// plain words inside Scrim instead of on an explorer.
import type { Network } from "@/protocol/networks";
import { viewCall } from "./near-rpc";

const INDEX: Record<Network, string> = { mainnet: "https://tx.main.fastnear.com", testnet: "https://tx.test.fastnear.com" };

export type WalletActivity = {
  hash: string;
  at: string;
  ok: boolean;
  kind: "sent" | "received" | "action" | "account";
  counterparty: string | null;
  amount: string | null; // minor units
  token: { contract: string | null; symbol: string; decimals: number } | null;
  label: string;
};

type Action = Record<string, { deposit?: string; method_name?: string; args?: string; delegate_action?: { sender_id: string; receiver_id: string; actions: Action[] } }> | string;
type Tx = { transaction: { signer_id: string; receiver_id: string; hash: string; actions: Action[] } };
type AccountTx = { transaction_hash: string; tx_block_timestamp: string; is_success: boolean };

async function post<T>(network: Network, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${INDEX[network]}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Transaction index responded ${response.status}`);
  return (await response.json()) as T;
}

const tokenCache = new Map<string, { symbol: string; decimals: number }>();
// Common NEAR tokens, so a send still reads right if the token's own metadata can't be read.
const KNOWN: Record<string, { symbol: string; decimals: number }> = {
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": { symbol: "USDC", decimals: 6 },
  "usdt.tether-token.near": { symbol: "USDT", decimals: 6 },
  "wrap.near": { symbol: "wNEAR", decimals: 24 },
};
async function tokenInfo(network: Network, contract: string) {
  const key = `${network}:${contract}`;
  if (!tokenCache.has(key)) {
    const meta = await viewCall<{ symbol: string; decimals: number }>(network, contract, "ft_metadata").catch(() => null);
    if (!meta) return KNOWN[contract] ?? null;
    tokenCache.set(key, { symbol: meta.symbol, decimals: meta.decimals });
  }
  return tokenCache.get(key)!;
}

const NEAR = { contract: null, symbol: "NEAR", decimals: 24 };

const args = (raw?: string): Record<string, unknown> => {
  try {
    return raw ? JSON.parse(Buffer.from(raw, "base64").toString("utf8")) : {};
  } catch {
    return {};
  }
};

// Plain names for common app actions; anything else reads as its own name in words.
const ACTIONS: Record<string, string> = {
  add_public_key: "Key added for private money",
  storage_deposit: "Token set up",
  execute_intents: "Private balance used",
  near_deposit: "Wrapped NEAR",
  near_withdraw: "Unwrapped NEAR",
  request_near: "Got test NEAR",
  create_account: "Account created",
  add_proposal: "Proposal made",
  act_proposal: "Voted on a proposal",
  propose_config: "Change proposed",
  execute_config: "Change applied",
  approve: "Approved",
  confirm: "Approved",
};
const words = (method: string) => ACTIONS[method] ?? method.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

async function describe(network: Network, me: string, signer: string, receiver: string, actions: Action[]): Promise<Omit<WalletActivity, "hash" | "at" | "ok">> {
  // A transaction often sets up the token first, then sends. Describe what it was for: the payment, else the first real action.
  const fn = (a: Action) => (typeof a === "string" ? "" : a.FunctionCall?.method_name ?? "");
  const first = actions.find((a) => typeof a !== "string" && (a.Transfer || ["ft_transfer", "ft_transfer_call"].includes(fn(a))))
    ?? actions.find((a) => !["storage_deposit", "near_deposit"].includes(fn(a))) ?? actions[0];
  if (typeof first === "string") return { kind: "account", counterparty: null, amount: null, token: null, label: first === "CreateAccount" ? "Account created" : "Account change" };
  const [type, body] = Object.entries(first ?? {})[0] ?? ["", {}];

  // A gas-free transaction relayed for someone: describe what it carried.
  if (type === "Delegate" && body.delegate_action) {
    const d = body.delegate_action;
    return describe(network, me, d.sender_id, d.receiver_id, d.actions);
  }
  if (type === "Transfer") {
    const amount = actions.reduce((sum, a) => sum + BigInt(typeof a !== "string" && a.Transfer?.deposit ? a.Transfer.deposit : 0), 0n).toString();
    return signer === me
      ? { kind: "sent", counterparty: receiver, amount, token: NEAR, label: "Sent" }
      : { kind: "received", counterparty: signer, amount, token: NEAR, label: "Received" };
  }
  if (type === "FunctionCall" && body.method_name) {
    const call = args(body.args);
    if ((body.method_name === "ft_transfer" || body.method_name === "ft_transfer_call") && typeof call.receiver_id === "string" && typeof call.amount === "string") {
      const info = await tokenInfo(network, receiver);
      const token = info ? { contract: receiver, ...info } : { contract: receiver, symbol: receiver, decimals: 0 };
      return signer === me
        ? { kind: "sent", counterparty: call.receiver_id, amount: call.amount, token, label: "Sent" }
        : { kind: "received", counterparty: signer, amount: call.amount, token, label: "Received" };
    }
    const deposit = body.deposit && body.deposit !== "0" && body.deposit !== "1" ? body.deposit : null;
    return { kind: "action", counterparty: signer === me ? receiver : signer, amount: deposit, token: deposit ? NEAR : null, label: words(body.method_name) };
  }
  if (type === "AddKey" || type === "DeleteKey") return { kind: "account", counterparty: null, amount: null, token: null, label: type === "AddKey" ? "Sign-in key added" : "Sign-in key removed" };
  if (type === "DeployContract") return { kind: "account", counterparty: null, amount: null, token: null, label: "App installed on account" };
  return { kind: "account", counterparty: null, amount: null, token: null, label: "Account change" };
}

// Most recent first: every transaction that touched this account.
export async function walletActivity(network: Network, accountId: string, limit = 30): Promise<WalletActivity[]> {
  const { account_txs = [] } = await post<{ account_txs?: AccountTx[] }>(network, "/v0/account", { account_id: accountId, max_tx_count: limit, desc: true });
  if (account_txs.length === 0) return [];
  const { transactions = [] } = await post<{ transactions?: Tx[] }>(network, "/v0/transactions", { tx_hashes: account_txs.map((t) => t.transaction_hash) });
  const byHash = new Map(transactions.map((t) => [t.transaction.hash, t.transaction]));
  const rows = await Promise.all(
    account_txs.map(async (t) => {
      const tx = byHash.get(t.transaction_hash);
      if (!tx) return null;
      const what = await describe(network, accountId, tx.signer_id, tx.receiver_id, tx.actions);
      return { hash: t.transaction_hash, at: new Date(Number(BigInt(t.tx_block_timestamp) / 1_000_000n)).toISOString(), ok: t.is_success, ...what };
    }),
  );
  return rows.filter((r): r is WalletActivity => r !== null).sort((a, b) => b.at.localeCompare(a.at));
}
