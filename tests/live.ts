// Helpers for tests that run against the real services: NEAR testnet and mainnet RPC, the testnet
// account creator, and NEAR Intents. Where the machine allows, "testnet" is a local NEAR chain run by
// near-kit's sandbox (see sandbox-setup.ts): a real node, with accounts made in seconds. Nothing is faked. A "wallet" here is a real ed25519 key that
// signs real messages and real transactions, exactly as a person's wallet would.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import { encodePublicKey, nep413Digest } from "@/protocol/nep413";
import type { Network } from "@/protocol/networks";
import { createOwnershipChallenge, createSignInChallenge, reconnectPrivateBalance, sessionFromToken, signIn, type IssuedChallenge, type Session, type SignedEnvelope } from "@/server/auth";
import { sql } from "@/server/db";
import { endpoints } from "@/server/config";
import { migrate } from "../scripts/migrate";
import { inject } from "vitest";

declare module "vitest" {
  export interface ProvidedContext { sandbox: { rpcUrl: string } | null }
}

/** The local NEAR chain for this run, or null when tests use the real testnet. */
export const sandbox = inject("sandbox");
if (sandbox) process.env.NEAR_RPC_URL_TESTNET = sandbox.rpcUrl;

export async function resetDatabase() {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await migrate(() => {});
}

export type Wallet = {
  accountId: string;
  network: Network;
  publicKey: string;
  sign(challenge: IssuedChallenge): SignedEnvelope;
  signPayload(payload: { message: string; nonce: string; recipient: string }): { publicKey: string; signature: string };
  /** A real on-chain NEAR transfer signed by this wallet. Returns the transaction hash. */
  send(receiverId: string, yocto: bigint): Promise<string>;
};

export function walletFor(accountId: string, network: Network, secret: Uint8Array): Wallet {
  const publicKey = encodePublicKey(ed25519.getPublicKey(secret));
  const signDigest = (digest: Uint8Array) => Buffer.from(ed25519.sign(digest, secret)).toString("base64");
  return {
    accountId, network, publicKey,
    sign(challenge) {
      const digest = nep413Digest({ message: challenge.message, nonce: Buffer.from(challenge.nonce, "base64"), recipient: challenge.recipient });
      return { challengeId: challenge.challengeId, accountId, publicKey, signature: signDigest(digest) };
    },
    signPayload(payload) {
      return { publicKey, signature: signDigest(nep413Digest({ message: payload.message, nonce: Buffer.from(payload.nonce, "base64"), recipient: payload.recipient })) };
    },
    async send(receiverId, yocto) {
      const signer = new KeyPairSigner(KeyPairFromSecret(secret));
      const account = new Account(accountId, new JsonRpcProvider({ url: endpoints(network).rpcUrl }), signer);
      const outcome = await account.transfer({ receiverId, amount: yocto });
      return outcome.transaction.hash as string;
    },
  };
}

import { KeyPair } from "near-api-js";
function KeyPairFromSecret(secret: Uint8Array) {
  const full = new Uint8Array(64);
  full.set(secret, 0);
  full.set(ed25519.getPublicKey(secret), 32);
  return KeyPair.fromString(`ed25519:${bs58.encode(full)}` as `ed25519:${string}`);
}

async function waitForKey(network: Network, accountId: string, publicKey: string, rpcUrl = endpoints(network).rpcUrl) {
  for (let i = 0; i < 20; i++) {
    const response = await fetch(rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey } }),
    });
    const body = (await response.json()) as { result?: { permission?: unknown } };
    if (body.result?.permission) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Account ${accountId} did not appear on ${network}.`);
}

// Testnet accounts are real and stay on chain, so tests reuse the ones they made before instead of
// asking NEAR's account creator for new ones every run (it limits how many it hands out).
const WALLET_CACHE = join(import.meta.dirname, ".wallets.json");
type Cached = Record<string, { accountId: string; secret: string }>;
const readCache = (): Cached => { try { return JSON.parse(readFileSync(WALLET_CACHE, "utf8")); } catch { return {}; } };

async function liveBalance(accountId: string): Promise<bigint | null> {
  const response = await fetch(endpoints("testnet").rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: accountId } }),
  });
  const body = (await response.json()) as { result?: { amount?: string } };
  return body.result?.amount ? BigInt(body.result.amount) : null;
}

/** A real, funded NEAR testnet account: reused from earlier runs when it still has test NEAR, otherwise newly created. */
export async function createTestnetWallet(prefix: string): Promise<Wallet> {
  if (sandbox) return sandboxWallet(prefix, "testnet");
  const cache = readCache();
  const hit = cache[prefix];
  if (hit) {
    const balance = await liveBalance(hit.accountId).catch(() => null);
    if (balance !== null && balance > 2n * 10n ** 24n) return walletFor(hit.accountId, "testnet", Buffer.from(hit.secret, "hex"));
  }
  const wallet = await newTestnetWallet(prefix);
  return wallet;
}

async function newTestnetWallet(prefix: string): Promise<Wallet> {
  const secret = ed25519.utils.randomSecretKey();
  const publicKey = encodePublicKey(ed25519.getPublicKey(secret));
  const accountId = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.testnet`;
  const response = await fetch("https://helper.testnet.near.org/account", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
  });
  if (!response.ok) throw new Error(`Testnet account creation failed (${response.status}).`);
  await waitForKey("testnet", accountId, publicKey);
  try {
    writeFileSync(WALLET_CACHE, JSON.stringify({ ...readCache(), [prefix]: { accountId, secret: Buffer.from(secret).toString("hex") } }, null, 1));
  } catch {
    // Caching is only a convenience.
  }
  return walletFor(accountId, "testnet", secret);
}

/**
 * A funded account on the local chain, named the way its network names accounts (`….testnet` or
 * `….near`), with one full-access key. Written straight into the chain's state, so no faucet is needed.
 */
export async function sandboxWallet(prefix: string, network: Network, near = 100): Promise<Wallet> {
  if (!sandbox) throw new Error("No local NEAR chain in this run.");
  const secret = ed25519.utils.randomSecretKey();
  const publicKey = encodePublicKey(ed25519.getPublicKey(secret));
  const accountId = `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${network === "mainnet" ? "near" : "testnet"}`;
  await patchState([
    { Account: { account_id: accountId, account: { amount: NEAR(near).toString(), locked: "0", code_hash: "11111111111111111111111111111111", storage_usage: 182 } } },
    { AccessKey: { account_id: accountId, public_key: publicKey, access_key: { nonce: 0, permission: "FullAccess" } } },
  ]);
  await waitForKey(network, accountId, publicKey, sandbox.rpcUrl);
  return walletFor(accountId, network, secret);
}

/** Adds a key to an account on the local chain: full access, or a function-call key for one contract. */
export async function addSandboxKey(accountId: string, secret: Uint8Array, permission: "FullAccess" | { receiver_id: string }) {
  const publicKey = encodePublicKey(ed25519.getPublicKey(secret));
  await patchState([{ AccessKey: { account_id: accountId, public_key: publicKey, access_key: { nonce: 0, permission: permission === "FullAccess" ? "FullAccess" : { FunctionCall: { allowance: null, receiver_id: permission.receiver_id, method_names: [] } } } } }]);
}

async function patchState(records: unknown[]) {
  const response = await fetch(sandbox!.rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "patch", method: "sandbox_patch_state", params: { records } }),
  });
  const body = (await response.json()) as { error?: { message?: string } };
  if (body.error) throw new Error(`Couldn't write to the local chain: ${body.error.message}`);
}

/** A mainnet implicit account: its ID is its public key, so no on-chain setup is needed. Holds no funds. */
export function mainnetImplicitWallet(): Wallet {
  const secret = ed25519.utils.randomSecretKey();
  return walletFor(Buffer.from(ed25519.getPublicKey(secret)).toString("hex"), "mainnet", secret);
}

// Signs in, then on mainnet unlocks the private balance the way a person does when they choose to.
export async function signInAs(wallet: Wallet): Promise<{ session: Session; token: string; privateStatus: string }> {
  const { token, privateStatus } = await signIn(wallet.sign(await createSignInChallenge(wallet.accountId, wallet.network)));
  const session = (await sessionFromToken(token))!;
  if (wallet.network !== "mainnet") return { session, token, privateStatus };
  return { session, token, privateStatus: await reconnectPrivateBalance(session, wallet.sign(await createOwnershipChallenge(sql, wallet.accountId, wallet.network, session.id))) };
}

export const NEAR = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
