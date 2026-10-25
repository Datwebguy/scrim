// Solana wallets (Phantom, Solflare, Backpack and others) announce themselves through the wallet standard,
// so no wallet-specific code is needed. The wallet signs and sends; Scrim never sees a key.
import { SolanaSignAndSendTransaction } from "@solana/wallet-standard-features";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import bs58 from "bs58";
import { api } from "./api";
import { buildDepositTransaction } from "./solana-tx";

const CHAIN = "solana:mainnet";
const SEND = SolanaSignAndSendTransaction;
const CONNECT = "standard:connect";

export type SolanaWallet = { name: string; icon: string; wallet: Wallet };

// Wallets in this browser that can send a Solana transaction.
export function solanaWallets(): SolanaWallet[] {
  if (typeof window === "undefined") return [];
  return getWallets().get().filter((w) => CONNECT in w.features && SEND in w.features && w.chains.includes(CHAIN)).map((w) => ({ name: w.name, icon: w.icon, wallet: w }));
}

// Calls back when a wallet appears after the page loaded (extensions can be slow to announce themselves).
export function onSolanaWallets(listener: () => void): () => void {
  const { on } = getWallets();
  const stop = [on("register", listener), on("unregister", listener)];
  return () => stop.forEach((off) => off());
}

type Feature<T> = Record<string, T>;

async function connect(wallet: Wallet): Promise<WalletAccount> {
  const { accounts } = await (wallet.features as unknown as Feature<{ connect(): Promise<{ accounts: WalletAccount[] }> }>)[CONNECT].connect();
  const account = accounts.find((a) => a.chains.includes(CHAIN)) ?? accounts[0];
  if (!account) throw new Error("Your wallet didn't share an account. Try again.");
  return account;
}

// Pays a one-time deposit address with SOL or an SPL token. Returns the transaction signature.
export async function payWithSolana(wallet: Wallet, input: { to: string; mint: string | null; decimals: number; amount: bigint }): Promise<string> {
  const account = await connect(wallet);
  const context = await api<{ blockhash: string; lastValidBlockHeight: string; tokenProgram: string | null }>(`/solana/context${input.mint ? `?mint=${encodeURIComponent(input.mint)}` : ""}`);
  const transaction = await buildDepositTransaction({
    payer: account.address, to: input.to, amount: input.amount, mint: input.mint, decimals: input.decimals,
    blockhash: context.blockhash, lastValidBlockHeight: BigInt(context.lastValidBlockHeight), tokenProgram: context.tokenProgram ?? undefined,
  });
  const [sent] = await (wallet.features as unknown as Feature<{ signAndSendTransaction(...inputs: { account: WalletAccount; chain: string; transaction: Uint8Array }[]): Promise<{ signature: Uint8Array }[]> }>)[SEND]
    .signAndSendTransaction({ account, chain: CHAIN, transaction });
  return bs58.encode(sent.signature);
}
