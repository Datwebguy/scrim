"use client";
// Browser wallet bridge. NEAR Connect lets any supported wallet sign in. Private keys never leave
// the wallet: Scrim only ever receives signatures.
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { api } from "./api";

type Challenge = { challengeId: string; message: string; nonce: string; recipient: string };
type Payload = { message: string; nonce: string; recipient: string };

const NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK === "testnet" ? "testnet" : "mainnet";
let connectorPromise: Promise<NearConnector> | null = null;

function connector() {
  connectorPromise ??= import("@hot-labs/near-connect").then(
    ({ NearConnector }) => new NearConnector({ network: NETWORK, features: { signMessage: true }, autoConnect: true }),
  );
  return connectorPromise;
}

const nonceBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function connectedWallet(): Promise<{ wallet: NearWalletBase; accountId: string }> {
  const near = await connector();
  let wallet: NearWalletBase | null = null;
  try {
    wallet = (await near.getConnectedWallet()).wallet;
  } catch {
    wallet = await near.connect();
  }
  const accounts = await wallet.getAccounts({ network: NETWORK });
  if (!accounts[0]) throw new Error("Your wallet didn't share an account. Try again.");
  return { wallet, accountId: accounts[0].accountId };
}

async function signMessage(wallet: NearWalletBase, accountId: string, challenge: Challenge) {
  const signed = await wallet.signMessage({
    message: challenge.message, recipient: challenge.recipient, nonce: nonceBytes(challenge.nonce), signerId: accountId, network: NETWORK,
  });
  return { challengeId: challenge.challengeId, accountId: signed.accountId || accountId, publicKey: signed.publicKey, signature: signed.signature };
}

export async function signInWithWallet(): Promise<{ accountId: string; privateStatus: string }> {
  const { wallet, accountId } = await connectedWallet();
  const challenge = await api<Challenge>("/auth/challenge", { body: { accountId } });
  return api("/auth/verify", { body: await signMessage(wallet, accountId, challenge) });
}

export async function unlockPrivateBalance(accountId: string) {
  const { wallet } = await connectedWallet();
  const challenge = await api<Challenge>("/private/unlock-challenge", { method: "POST" });
  return api("/private/unlock", { body: await signMessage(wallet, accountId, challenge) });
}

// Approving a team payment: the wallet signs a message that states the amount and recipient.
export async function signChallenge(challenge: Challenge, accountId: string) {
  const { wallet } = await connectedWallet();
  return signMessage(wallet, accountId, challenge);
}

// Sending money: the wallet signs the exact transfer, shown to the person by the wallet.
export async function signTransfer(payload: Payload, accountId: string) {
  const { wallet } = await connectedWallet();
  const signed = await wallet.signMessage({
    message: payload.message, recipient: payload.recipient, nonce: nonceBytes(payload.nonce), signerId: accountId, network: NETWORK,
  });
  return { publicKey: signed.publicKey, signature: signed.signature };
}

// A named NEAR account registers its wallet key once, so private mode can verify it.
export async function turnOnPrivateMode(publicKey: string) {
  const { wallet, accountId } = await connectedWallet();
  await wallet.signAndSendTransaction({
    network: NETWORK, signerId: accountId, receiverId: "intents.near",
    actions: [{ type: "FunctionCall", params: { methodName: "add_public_key", args: { public_key: publicKey }, gas: "100000000000000", deposit: "1" } }],
  });
}

export async function signOutWallet() {
  await api("/auth/logout", { method: "POST" });
  try {
    await (await connector()).disconnect();
  } catch {
    // No connected wallet to disconnect.
  }
}
