"use client";
// Browser wallet bridge. NEAR Connect lets any supported wallet sign in. Private keys never leave
// the wallet: Scrim only ever receives signatures. One connection is kept per network.
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import type { Network } from "@/protocol/networks";
import { api } from "./api";
import { emailSession, endEmailSession, signWithEmail } from "./email";

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

// Someone signed in with an email has no wallet app. This stands in for one: it signs messages through Privy
// and says plainly that sending from a public wallet balance isn't available for them yet.
function emailWallet(accountId: string): NearWalletBase {
  const unavailable = () => { throw new Error("Sending from a public wallet balance isn't available with an email sign in yet. Use your private balance."); };
  return {
    getAccounts: async () => [{ accountId }],
    signMessage: (params: { message: string; recipient: string; nonce: Uint8Array }) => signWithEmail(accountId, params),
    signAndSendTransaction: unavailable,
    signAndSendTransactions: unavailable,
  } as unknown as NearWalletBase;
}

async function connectedWallet(network: Network): Promise<{ wallet: NearWalletBase; accountId: string }> {
  const email = emailSession();
  if (email) return { wallet: emailWallet(email.accountId), accountId: email.accountId };
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

// The hash of a transaction the wallet sent, or an error if it failed or the wallet didn't say which it was.
function sentHash(outcome: unknown): string {
  const first = (Array.isArray(outcome) ? outcome[0] : outcome) as { status?: { Failure?: unknown } } | undefined;
  if (first?.status && "Failure" in first.status) throw new Error("Your wallet sent it, but the network refused it. Nothing was moved.");
  const hash = transactionHash(outcome);
  if (!hash) throw new Error("Your wallet sent it but didn't share its receipt. Check your wallet's history before trying again.");
  return hash;
}

// A plain on-chain NEAR transfer, signed and sent by the wallet.
export async function sendNear(network: Network, receiverId: string, yocto: string): Promise<string> {
  const { wallet, accountId } = await connectedWallet(network);
  const outcome = await wallet.signAndSendTransaction({
    network, signerId: accountId, receiverId, actions: [{ type: "Transfer", params: { deposit: yocto } }],
  });
  return sentHash(outcome);
}

// NEAR holds back about 0.001 NEAR for every unit of gas a transaction asks for, until it finishes, so the gas below is kept small:
// a payment from native NEAR asks for 50 Tgas and needs about 0.06 NEAR free besides the amount.
// A plain token transfer on NEAR, signed by the wallet. Registers the receiver with the token first
// (a tiny one-off storage deposit) so the transfer can't fail for an account the token hasn't seen.
const register = (account: string) =>
  ({ type: "FunctionCall" as const, params: { methodName: "storage_deposit", args: { account_id: account, registration_only: true }, gas: "10000000000000", deposit: "1250000000000000000000" } });

// wrapNative: pay with the wallet's own NEAR, wrapped first (NEAR Intents takes wrapped NEAR).
export async function sendToken(network: Network, contract: string, receiverId: string, amount: string, wrapNative = false): Promise<string> {
  const { wallet, accountId } = await connectedWallet(network);
  const outcome = await wallet.signAndSendTransaction({
    network, signerId: accountId, receiverId: contract,
    actions: [
      ...(wrapNative ? [register(accountId), { type: "FunctionCall" as const, params: { methodName: "near_deposit", args: {}, gas: "10000000000000", deposit: amount } }] : []),
      register(receiverId),
      { type: "FunctionCall", params: { methodName: "ft_transfer", args: { receiver_id: receiverId, amount }, gas: "20000000000000", deposit: "1" } },
    ],
  });
  return sentHash(outcome);
}

export async function signOutWallet(network: Network) {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    // The session may already have ended.
  }
  if (emailSession()) {
    await endEmailSession();
    return;
  }
  try {
    await (await connector(network)).disconnect();
  } catch {
    // No connected wallet to disconnect.
  }
}
