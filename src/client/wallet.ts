"use client";
// Browser wallet bridge. Uses NEAR Connect so any supported wallet (HOT, Meteor, Intear,
// MyNearWallet, Nightly, OKX, Ledger via wallets that support it) can sign NEP-413 messages.
// Private keys never leave the wallet; Scrim only receives signatures.
import type { NearConnector } from "@hot-labs/near-connect";
import { api } from "./api";

type Challenge = { challengeId: string; message: string; nonce: string; recipient: string };
type Signed = { accountId: string; publicKey: string; signature: string };

const NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
let connectorPromise: Promise<NearConnector> | null = null;

function connector() {
  connectorPromise ??= import("@hot-labs/near-connect").then(
    ({ NearConnector }) => new NearConnector({ network: NETWORK, features: { signMessage: true }, autoConnect: true }),
  );
  return connectorPromise;
}

const nonceBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function signInWithWallet(): Promise<{ accountId: string }> {
  const challenge = await api<Challenge>("/auth/challenge", { method: "POST" });
  const near = await connector();
  const signed = await new Promise<Signed>((resolve, reject) => {
    const onSigned = (event: { accounts: { accountId: string; signedMessage: Signed }[]; success: boolean }) => {
      near.off("wallet:signInAndSignMessage", onSigned);
      const account = event.accounts[0];
      if (!event.success || !account?.signedMessage) reject(new Error("The wallet did not return a signature."));
      else resolve({ ...account.signedMessage, accountId: account.accountId });
    };
    near.on("wallet:signInAndSignMessage", onSigned);
    near
      .connect({ signMessageParams: { message: challenge.message, recipient: challenge.recipient, nonce: nonceBytes(challenge.nonce) } })
      .catch((error: unknown) => {
        near.off("wallet:signInAndSignMessage", onSigned);
        reject(error instanceof Error ? error : new Error("Wallet connection was cancelled."));
      });
  });
  return api("/auth/verify", { body: { challengeId: challenge.challengeId, ...signed } });
}

export async function signChallenge(challenge: Challenge, accountId: string) {
  const near = await connector();
  const wallet = await near.wallet();
  const signed = await wallet.signMessage({
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: nonceBytes(challenge.nonce),
    signerId: accountId,
    network: NETWORK,
  });
  return { challengeId: challenge.challengeId, accountId: signed.accountId || accountId, publicKey: signed.publicKey, signature: signed.signature };
}

export async function signOutWallet() {
  await api("/auth/logout", { method: "POST" });
  try {
    const near = await connector();
    await near.disconnect();
  } catch {
    // No connected wallet to disconnect.
  }
}
