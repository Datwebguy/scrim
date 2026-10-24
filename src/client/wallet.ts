"use client";
// Browser wallet bridge. NEAR Connect lets any supported wallet sign in. Private keys never leave
// the wallet: Scrim only ever receives signatures. One connection is kept per network.
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import type { Network } from "@/protocol/networks";
import { api } from "./api";

type Challenge = { challengeId: string; message: string; nonce: string; recipient: string };
type Payload = { message: string; nonce: string; recipient: string };

const connectors = new Map<Network, Promise<NearConnector>>();

function connector(network: Network) {
  let existing = connectors.get(network);
  if (!existing) {
    existing = import("@hot-labs/near-connect").then(({ NearConnector }) => new NearConnector({ network, features: { signMessage: true }, autoConnect: true }));
    connectors.set(network, existing);
  }
  return existing;
}

const nonceBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// On a phone the wallet opens in another tab, and the page can lose track of it while it is away.
// So while we wait we also keep checking whether the wallet has connected, and again the moment the
// person comes back to this page.
function waitForWallet(near: NearConnector): Promise<NearWalletBase> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const stop = () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    const done = (wallet: NearWalletBase) => {
      if (finished) return;
      finished = true;
      stop();
      resolve(wallet);
    };
    const check = async () => {
      try {
        done((await near.getConnectedWallet()).wallet);
      } catch {
        // Not connected yet.
      }
    };
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    const timer = setInterval(check, 1000);
    document.addEventListener("visibilitychange", onVisible);
    near.connect().then(done, (error) => {
      if (finished) return;
      finished = true;
      stop();
      reject(error);
    });
  });
}

// The account already connected in this browser, if any, so the sign-in screen can offer to continue with it.
export async function connectedAccount(network: Network): Promise<string | null> {
  try {
    const near = await connector(network);
    const { wallet } = await near.getConnectedWallet();
    return (await wallet.getAccounts({ network }))[0]?.accountId ?? null;
  } catch {
    return null;
  }
}

async function connectedWallet(network: Network): Promise<{ wallet: NearWalletBase; accountId: string }> {
  const near = await connector(network);
  let wallet: NearWalletBase;
  try {
    wallet = (await near.getConnectedWallet()).wallet;
  } catch {
    wallet = await waitForWallet(near);
  }
  const accounts = await wallet.getAccounts({ network });
  if (!accounts[0]) throw new Error("Your wallet didn't share an account. Try again.");
  return { wallet, accountId: accounts[0].accountId };
}

async function signMessage(wallet: NearWalletBase, network: Network, accountId: string, challenge: Challenge) {
  const signed = await wallet.signMessage({
    message: challenge.message, recipient: challenge.recipient, nonce: nonceBytes(challenge.nonce), signerId: accountId, network,
  });
  return { challengeId: challenge.challengeId, accountId: signed.accountId || accountId, publicKey: signed.publicKey, signature: signed.signature };
}

export async function signInWithWallet(network: Network): Promise<{ accountId: string; privateStatus: string }> {
  const { wallet, accountId } = await connectedWallet(network);
  const challenge = await api<Challenge>("/auth/challenge", { body: { accountId, network } });
  return api("/auth/verify", { body: await signMessage(wallet, network, accountId, challenge) });
}

export async function unlockPrivateBalance(network: Network, accountId: string) {
  const { wallet } = await connectedWallet(network);
  const challenge = await api<Challenge>("/private/unlock-challenge", { method: "POST" });
  return api("/private/unlock", { body: await signMessage(wallet, network, accountId, challenge) });
}

// Approving a team payment: the wallet signs a message that states the amount and recipient.
export async function signChallenge(network: Network, challenge: Challenge, accountId: string) {
  const { wallet } = await connectedWallet(network);
  return signMessage(wallet, network, accountId, challenge);
}

// Sending money: the wallet signs the exact transfer, shown to the person by the wallet.
export async function signTransfer(network: Network, payload: Payload, accountId: string) {
  const { wallet } = await connectedWallet(network);
  const signed = await wallet.signMessage({
    message: payload.message, recipient: payload.recipient, nonce: nonceBytes(payload.nonce), signerId: accountId, network,
  });
  return { publicKey: signed.publicKey, signature: signed.signature };
}

// A named NEAR account registers its wallet key once, so private mode can verify it.
export async function turnOnPrivateMode(network: Network, publicKey: string) {
  const { wallet, accountId } = await connectedWallet(network);
  await wallet.signAndSendTransaction({
    network, signerId: accountId, receiverId: "intents.near",
    actions: [{ type: "FunctionCall", params: { methodName: "add_public_key", args: { public_key: publicKey }, gas: "30000000000000", deposit: "1" } }],
  });
}

// Wallets report a finished transaction in slightly different shapes. Find its hash in any of them.
function transactionHash(outcome: unknown): string {
  const first = (Array.isArray(outcome) ? outcome[0] : outcome) as Record<string, unknown> | undefined;
  const nested = (key: string) => (first?.[key] as Record<string, unknown> | undefined) ?? {};
  const hash = nested("transaction").hash ?? nested("transaction_outcome").id ?? first?.transactionHash ?? first?.txHash ?? first?.hash;
  return typeof hash === "string" ? hash : "";
}

// A plain on-chain NEAR transfer, signed and sent by the wallet.
export async function sendNear(network: Network, receiverId: string, yocto: string): Promise<string> {
  const { wallet, accountId } = await connectedWallet(network);
  const outcome = await wallet.signAndSendTransaction({
    network, signerId: accountId, receiverId, actions: [{ type: "Transfer", params: { deposit: yocto } }],
  });
  return transactionHash(outcome);
}

export async function signOutWallet(network: Network) {
  await api("/auth/logout", { method: "POST" });
  try {
    await (await connector(network)).disconnect();
  } catch {
    // No connected wallet to disconnect.
  }
}
