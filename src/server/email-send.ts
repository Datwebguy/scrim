import { createHash } from "node:crypto";
import bs58 from "bs58";
import { actions as actionCreators, createTransaction, encodeTransaction, KeyType, PublicKey, Signature, SignedTransaction, type Action } from "near-api-js";
import { normalizeNearAccount } from "@/protocol/identifiers";
import type { Network } from "@/protocol/networks";
import { endpoints } from "./config";
import { badRequest } from "./errors";
import { rpcQuery } from "./near-rpc";

// What an email account may send from its own public balance. An email account signs with no wallet window asking
// first, so Scrim signs only the plain things money needs: a NEAR transfer, a token transfer, the tiny one-off
// registration a token asks for, and wrapping or unwrapping NEAR. Anything else (keys, contracts, staking, deleting the account) is refused.

export type WalletAction = { type?: string; params?: Record<string, unknown> };

const WRAP: Record<Network, string> = { mainnet: "wrap.near", testnet: "wrap.testnet" };
const TERA = 1_000_000_000_000n;
const MAX_ACTIONS = 6;
const MAX_TOTAL_GAS = 150n * TERA;
const MAX_REGISTRATION = 10n ** 22n; // 0.01 NEAR, far above the ~0.00125 a token asks for

const digits = (value: unknown, what: string): bigint => {
  if (typeof value !== "string" || !/^[0-9]{1,40}$/.test(value)) throw badRequest(`${what} must be a whole number.`);
  return BigInt(value);
};
const account = (value: unknown, what: string): string => {
  const id = normalizeNearAccount(typeof value === "string" ? value : "");
  if (!id) throw badRequest(`${what} isn't a valid NEAR account.`);
  return id;
};
const onlyKeys = (args: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(args).sort().join() !== [...keys].sort().join()) throw badRequest("That call has fields Scrim doesn't sign.");
};

// Checks a wallet-style request and turns it into NEAR actions. Throws for anything outside the plain money moves.
export function allowedActions(network: Network, receiverIdInput: string, input: WalletAction[]): { receiverId: string; actions: Action[] } {
  const receiverId = account(receiverIdInput, "The recipient");
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_ACTIONS) throw badRequest("Send between 1 and 6 actions.");
  let gas = 0n;
  const actions = input.map((action): Action => {
    const params = (action.params ?? {}) as Record<string, unknown>;
    if (action.type === "Transfer") {
      const deposit = digits(params.deposit, "The amount");
      if (deposit <= 0n) throw badRequest("The amount must be more than zero.");
      return actionCreators.transfer(deposit);
    }
    if (action.type !== "FunctionCall") throw badRequest("Scrim doesn't sign that kind of action for an email account.");
    const callGas = digits(params.gas, "The gas");
    const deposit = digits(params.deposit, "The deposit");
    const args = (params.args ?? {}) as Record<string, unknown>;
    gas += callGas;
    switch (params.methodName) {
      case "ft_transfer": {
        onlyKeys(args, ["receiver_id", "amount"]);
        if (deposit !== 1n || callGas > 50n * TERA) throw badRequest("That token transfer isn't in the usual form.");
        if (digits(args.amount, "The amount") <= 0n) throw badRequest("The amount must be more than zero.");
        return actionCreators.functionCall("ft_transfer", { receiver_id: account(args.receiver_id, "The recipient"), amount: args.amount }, callGas, deposit);
      }
      case "storage_deposit": {
        onlyKeys(args, ["account_id", "registration_only"]);
        if (args.registration_only !== true || deposit > MAX_REGISTRATION || callGas > 30n * TERA) throw badRequest("That registration isn't in the usual form.");
        return actionCreators.functionCall("storage_deposit", { account_id: account(args.account_id, "The account"), registration_only: true }, callGas, deposit);
      }
      case "near_deposit": {
        onlyKeys(args, []);
        if (receiverId !== WRAP[network] || deposit <= 0n || callGas > 30n * TERA) throw badRequest("Only NEAR can be wrapped, and only by the wrapped NEAR contract.");
        return actionCreators.functionCall("near_deposit", {}, callGas, deposit);
      }
      case "near_withdraw": {
        onlyKeys(args, ["amount"]);
        if (receiverId !== WRAP[network] || deposit !== 1n || callGas > 30n * TERA) throw badRequest("Only wrapped NEAR can be unwrapped, and only by the wrapped NEAR contract.");
        if (digits(args.amount, "The amount") <= 0n) throw badRequest("The amount must be more than zero.");
        return actionCreators.functionCall("near_withdraw", { amount: args.amount }, callGas, deposit);
      }
      default:
        throw badRequest("Scrim doesn't sign that call for an email account.");
    }
  });
  if (gas > MAX_TOTAL_GAS) throw badRequest("That asks for more gas than a plain payment needs.");
  return { receiverId, actions };
}

// The signed transaction for the account's key. `sign` signs the 32 byte hash of the transaction.
export async function signedTransaction(network: Network, accountId: string, publicKey: string, receiverId: string, actions: Action[], sign: (hash: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const key = await rpcQuery<{ nonce: number | string; block_hash: string; permission?: unknown; error?: string }>(network, { request_type: "view_access_key", account_id: accountId, public_key: publicKey });
  if (key.result?.nonce === undefined || !key.result.block_hash) throw badRequest(`This account has nothing on ${network} yet. Send some NEAR to its address first, then try again.`);
  if (key.result.permission !== "FullAccess") throw badRequest("This account's key can't send.");
  const transaction = createTransaction(accountId, PublicKey.from(publicKey), receiverId, BigInt(key.result.nonce) + 1n, actions, bs58.decode(key.result.block_hash));
  const hash = createHash("sha256").update(encodeTransaction(transaction)).digest();
  const signature = await sign(new Uint8Array(hash));
  if (signature.length !== 64) throw new Error("The signature has an unexpected size.");
  return encodeTransaction(new SignedTransaction({ transaction, signature: new Signature({ keyType: KeyType.ED25519, data: signature }) }));
}

// Sends a signed transaction and waits until it has run. The answer has the same shape a wallet app gives back.
export async function broadcast(network: Network, signed: Uint8Array): Promise<unknown> {
  const response = await fetch(endpoints(network).rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "send_tx", params: { signed_tx_base64: Buffer.from(signed).toString("base64"), wait_until: "EXECUTED" } }),
    signal: AbortSignal.timeout(30_000),
  });
  const answer = (await response.json()) as { result?: unknown; error?: { message?: string; data?: unknown } };
  if (!answer.result) throw badRequest(`The network didn't take it: ${answer.error?.message ?? "no answer"}. Nothing was moved.`);
  return answer.result;
}
