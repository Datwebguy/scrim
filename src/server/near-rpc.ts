import { isImplicitAccount } from "@/protocol/intents-auth";
import { parseEd25519PublicKey } from "@/protocol/nep413";
import { config } from "./config";

type RpcResult<T> = { result?: T; error?: { cause?: { name?: string }; message?: string } };

async function rpc<T>(url: string, params: Record<string, unknown>): Promise<RpcResult<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "query", params: { finality: "final", ...params } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`NEAR RPC responded ${response.status}`);
  return (await response.json()) as RpcResult<T>;
}

export type KeyVerifier = (accountId: string, publicKey: string) => Promise<boolean>;

// A signature only proves control of a key. The key must also control the claimed account:
// a current full-access key read from chain, or — for an implicit account that has never been
// used on chain — the key the account ID is derived from.
export const verifyAccountKeyOnChain: KeyVerifier = async (accountId, publicKey) => {
  const key = await rpc<{ permission?: unknown }>(config.rpcUrl, {
    request_type: "view_access_key",
    account_id: accountId,
    public_key: publicKey,
  });
  if (key.result?.permission !== undefined) return key.result.permission === "FullAccess";
  if (!isImplicitAccount(accountId)) return false;
  const account = await rpc<{ amount?: string }>(config.rpcUrl, { request_type: "view_account", account_id: accountId });
  if (account.result?.amount !== undefined) return false; // the account exists and this key is not on it
  try {
    return Buffer.from(parseEd25519PublicKey(publicKey)).toString("hex") === accountId;
  } catch {
    return false;
  }
};

let activeVerifier: KeyVerifier = verifyAccountKeyOnChain;
export const keyVerifier = () => activeVerifier;

// Test seam only. Production code never calls this.
export function setKeyVerifierForTests(verifier: KeyVerifier | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Key verifier cannot be replaced in production.");
  activeVerifier = verifier ?? verifyAccountKeyOnChain;
}

async function viewIntents<T>(method: string, args: Record<string, unknown>): Promise<T> {
  const payload = await rpc<{ result: number[] }>(config.intentsRpcUrl, {
    request_type: "call_function",
    account_id: "intents.near",
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  if (!payload.result) throw new Error(`intents.near ${method} failed: ${payload.error?.message ?? "no result"}`);
  return JSON.parse(Buffer.from(payload.result.result).toString("utf8")) as T;
}

export type IntentsChain = {
  currentSalt(): Promise<string>;
  hasPublicKey(accountId: string, publicKey: string): Promise<boolean>;
};

let cachedSalt: { value: string; at: number } | null = null;

export const intentsMainnet: IntentsChain = {
  async currentSalt() {
    if (cachedSalt && Date.now() - cachedSalt.at < 10 * 60_000) return cachedSalt.value;
    const value = await viewIntents<string>("current_salt", {});
    cachedSalt = { value, at: Date.now() };
    return value;
  },
  async hasPublicKey(accountId, publicKey) {
    if (isImplicitAccount(accountId)) return true;
    return viewIntents<boolean>("has_public_key", { account_id: accountId, public_key: publicKey });
  },
};

let activeIntents: IntentsChain = intentsMainnet;
export const intentsChain = () => activeIntents;
export function setIntentsChainForTests(chain: IntentsChain | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Intents chain cannot be replaced in production.");
  activeIntents = chain ?? intentsMainnet;
}
