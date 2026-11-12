import { isImplicitAccount } from "@/protocol/intents-auth";
import { parseEd25519PublicKey } from "@/protocol/nep413";
import { endpoints, type Network } from "./config";

type RpcResult<T> = { result?: T; error?: { cause?: { name?: string }; message?: string } };

export async function rpcQuery<T>(network: Network, params: Record<string, unknown>): Promise<RpcResult<T>> {
  const response = await fetch(endpoints(network).rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "query", params: { finality: "final", ...params } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`NEAR RPC responded ${response.status}`);
  return (await response.json()) as RpcResult<T>;
}

const MISSING = new Set(["UNKNOWN_ACCOUNT", "UNKNOWN_ACCESS_KEY"]);
function definitelyMissing(answer: RpcResult<{ error?: string }>): boolean {
  if (answer.error) return MISSING.has(answer.error.cause?.name ?? "");
  return typeof answer.result?.error === "string" && /does not exist/i.test(answer.result.error);
}

// A signature only proves control of a key. The key must also control the claimed account:
// a current full-access key read from chain, or, for an implicit account never used on chain,
// the key the account ID is derived from.
export async function verifyAccountKey(network: Network, accountId: string, publicKey: string): Promise<boolean> {
  const key = await rpcQuery<{ permission?: unknown; error?: string }>(network, { request_type: "view_access_key", account_id: accountId, public_key: publicKey });
  if (key.result?.permission !== undefined) return key.result.permission === "FullAccess";
  // Only a definite "no such key / no such account" may go on to the implicit-account check. Any
  // other answer (rate limit, timeout, node error) fails closed.
  if (!isImplicitAccount(accountId) || !definitelyMissing(key)) return false;
  const account = await rpcQuery<{ amount?: string; error?: string }>(network, { request_type: "view_account", account_id: accountId });
  if (account.result?.amount !== undefined) return false; // the account exists and this key is not on it
  if (!definitelyMissing(account)) return false;
  try {
    return Buffer.from(parseEd25519PublicKey(publicKey)).toString("hex") === accountId;
  } catch {
    return false;
  }
}

export async function viewCall<T>(network: Network, contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const payload = await rpcQuery<{ result: number[] }>(network, {
    request_type: "call_function", account_id: contractId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  if (!payload.result) throw new Error(`${contractId} ${method} failed: ${payload.error?.message ?? "no result"}`);
  return JSON.parse(Buffer.from(payload.result.result).toString("utf8")) as T;
}

// NEAR Intents lives on mainnet only.
let cachedSalt: { value: string; at: number } | null = null;

export const intentsChain = {
  async currentSalt(): Promise<string> {
    if (cachedSalt && Date.now() - cachedSalt.at < 10 * 60_000) return cachedSalt.value;
    const value = await viewCall<string>("mainnet", "intents.near", "current_salt");
    cachedSalt = { value, at: Date.now() };
    return value;
  },
  async hasPublicKey(accountId: string, publicKey: string): Promise<boolean> {
    // An implicit account always holds the key its name is made from; any other key must be on record at intents.near.
    if (isImplicitAccount(accountId)) {
      try { if (Buffer.from(parseEd25519PublicKey(publicKey)).toString("hex") === accountId.toLowerCase()) return true; } catch { return false; }
    }
    return viewCall<boolean>("mainnet", "intents.near", "has_public_key", { account_id: accountId, public_key: publicKey });
  },
};

// Reads a finished transaction from chain, as final as the network allows.
export type FinalTransaction = {
  transaction: { signer_id: string; receiver_id: string; hash: string; actions: Record<string, { deposit?: string }>[] };
  status: { SuccessValue?: string; Failure?: unknown };
  transaction_outcome?: { block_hash?: string };
};

// When a block was produced, read from chain.
export async function blockTime(network: Network, blockHash: string): Promise<Date | null> {
  const response = await fetch(endpoints(network).rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "block", params: { block_id: blockHash } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const ns = ((await response.json()) as { result?: { header?: { timestamp_nanosec?: string } } }).result?.header?.timestamp_nanosec;
  return ns ? new Date(Number(BigInt(ns) / 1_000_000n)) : null;
}

export async function finalTransaction(network: Network, txHash: string, signerId: string): Promise<FinalTransaction | null> {
  const response = await fetch(endpoints(network).rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "tx", params: { tx_hash: txHash, sender_account_id: signerId, wait_until: "FINAL" } }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`NEAR RPC responded ${response.status}`);
  const payload = (await response.json()) as { result?: FinalTransaction; error?: unknown };
  return payload.result ?? null;
}
