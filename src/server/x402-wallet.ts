// Agents paying standard x402 sellers from their own OutLayer wallet.
//
// Most x402 sellers ask for a signed USDC authorization on an EVM chain (EIP-3009, or Permit2 for `upto`)
// or a partially signed Solana transfer; their payment service submits it and pays the fees. Scrim builds
// those payments with the x402 reference client and has the agent's wallet sign them inside OutLayer's
// enclave. When the wallet's address on the seller's chain is short, Scrim first tops it up from the
// agent's private balance (or public one), so the seller never sees where the money came from.
import { x402Client } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { address as solAddress, getBase58Encoder, type TransactionPartialSigner } from "@solana/kit";
import { createPublicClient, erc20Abi, http, type Chain } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon } from "viem/chains";
import type { Network } from "@/protocol/networks";
import * as outlayer from "./outlayer";

export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

// The EVM chains an agent wallet can pay on: OutLayer's name for each (signing and top-ups) and its viem chain.
const EVM: Record<number, { name: string; chain: Chain }> = {
  1: { name: "ethereum", chain: mainnet },
  8453: { name: "base", chain: base },
  42161: { name: "arbitrum", chain: arbitrum },
  10: { name: "optimism", chain: optimism },
  137: { name: "polygon", chain: polygon },
  56: { name: "bsc", chain: bsc },
  43114: { name: "avalanche", chain: avalanche },
};

const evmId = (network: string) => (network.startsWith("eip155:") ? Number(network.slice(7)) : null);

// OutLayer's chain name for an x402 network, or null when an agent wallet can't pay there.
export function walletChain(network: string): string | null {
  const id = evmId(network);
  if (id !== null) return EVM[id]?.name ?? null;
  return network === SOLANA_MAINNET ? "solana" : null;
}

// Entries Scrim can pay from an agent wallet: exact (EIP-3009 or Permit2) and upto on supported EVM
// chains, and exact on Solana. NEAR Intents entries are handled by the private route instead.
export function payableByWallet(entry: { scheme: string; network: string; amount: string; maxTimeoutSeconds?: number; extra?: Record<string, unknown> }): boolean {
  if (!walletChain(entry.network) || !entry.amount || !/^\d+$/.test(entry.amount)) return false;
  // Only the plain authorization flow, and a signature that expires within the hour.
  const flow = entry.extra?.paymentFlow;
  if (flow !== undefined && flow !== "authorization") return false;
  if (entry.maxTimeoutSeconds !== undefined && !(entry.maxTimeoutSeconds > 0 && entry.maxTimeoutSeconds <= 3600)) return false;
  const method = (entry.extra?.assetTransferMethod as string | undefined) ?? "eip3009";
  if (entry.network === SOLANA_MAINNET) return entry.scheme === "exact";
  if (entry.scheme === "exact") return method === "eip3009" || method === "permit2";
  return entry.scheme === "upto";
}

const rpc = (id: number) => createPublicClient({ chain: EVM[id].chain, transport: http(process.env[`EVM_RPC_URL_${id}`] || undefined) });
const SOLANA_RPC = () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const plain = (value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : Array.isArray(value) ? value.map(plain) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) : value;

function evmSigner(network: Network, apiKey: string, addr: `0x${string}`, chainId: number) {
  return {
    address: addr,
    signTypedData: (typed: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) => {
      const types = { ...typed.types };
      if (!("EIP712Domain" in types)) {
        const d = typed.domain;
        types.EIP712Domain = [
          d.name !== undefined && { name: "name", type: "string" },
          d.version !== undefined && { name: "version", type: "string" },
          d.chainId !== undefined && { name: "chainId", type: "uint256" },
          d.verifyingContract !== undefined && { name: "verifyingContract", type: "address" },
          d.salt !== undefined && { name: "salt", type: "bytes32" },
        ].filter(Boolean);
      }
      return outlayer.signTypedData(network, apiKey, EVM[chainId].name, plain({ ...typed, types }));
    },
    // Reads the token's permit nonce and allowance, for gas-free Permit2 approval.
    readContract: (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) =>
      rpc(chainId).readContract(args as never),
  };
}

function solanaSigner(network: Network, apiKey: string, addr: string): TransactionPartialSigner {
  const base58 = getBase58Encoder();
  return {
    address: solAddress(addr),
    signTransactions: (transactions) =>
      Promise.all(
        transactions.map(async (tx) => {
          const signature = await outlayer.signSolanaTransaction(network, apiKey, Buffer.from(tx.messageBytes).toString("base64"));
          return { [addr]: base58.encode(signature) } as never;
        }),
      ),
  };
}

export type WalletAddresses = { evm: `0x${string}` | null; solana: string | null };

export async function walletAddresses(network: Network, apiKey: string): Promise<WalletAddresses> {
  const [evm, solana] = await Promise.all([
    outlayer.address(network, apiKey, "base").then((a) => a.address as `0x${string}`).catch(() => null),
    outlayer.address(network, apiKey, "solana").then((a) => a.address).catch(() => null),
  ]);
  return { evm, solana };
}

// Builds the signed payment for exactly the entry Scrim chose, with the agent wallet as the signer.
// Scrim's own limits already apply, so the reference client's default spend cap is turned off.
// What the signer is shown: only the one entry Scrim checked, amount and terms included. Whatever else a
// seller lists can never be chosen by the payment library instead.
export function onlyChosen(required: PaymentRequired, chosen: PaymentRequirements): PaymentRequired {
  const same = (e: PaymentRequirements) => e.scheme === chosen.scheme && e.network === chosen.network && e.asset.toLowerCase() === chosen.asset.toLowerCase()
    && e.payTo === chosen.payTo && e.amount === chosen.amount && JSON.stringify(e.extra ?? {}) === JSON.stringify(chosen.extra ?? {});
  const match = required.accepts.find(same);
  if (!match) throw new Error("The approved payment route is no longer offered.");
  return { ...required, accepts: [match] };
}

export async function signPayment(network: Network, apiKey: string, required: PaymentRequired, chosen: PaymentRequirements, addrs: WalletAddresses) {
  const client = new x402Client((_v, list) => list[0]).setSpendControls(false);
  const id = evmId(chosen.network);
  if (id !== null) {
    if (!addrs.evm) throw new Error("The agent's wallet has no EVM address.");
    const signer = evmSigner(network, apiKey, addrs.evm, id);
    registerExactEvmScheme(client, { signer, networks: [chosen.network as never] });
    client.register(chosen.network as never, new UptoEvmScheme(signer));
  } else {
    if (!addrs.solana) throw new Error("The agent's wallet has no Solana address.");
    registerExactSvmScheme(client, { signer: solanaSigner(network, apiKey, addrs.solana), networks: [chosen.network as never] });
  }
  const payload = await client.createPaymentPayload(onlyChosen(required, chosen));
  if ((payload as { accepted?: { amount?: string } }).accepted?.amount !== chosen.amount) throw new Error("The payment to sign didn't match the approved price.");
  return payload;
}

// What the wallet's own address holds of the seller's token, in the token's smallest units.
export async function onChainBalance(entry: PaymentRequirements, addrs: WalletAddresses): Promise<bigint> {
  const id = evmId(entry.network);
  if (id !== null) {
    if (!addrs.evm) return 0n;
    return rpc(id).readContract({ address: entry.asset as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [addrs.evm] });
  }
  if (!addrs.solana) return 0n;
  const res = await fetch(SOLANA_RPC(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [addrs.solana, { mint: entry.asset }, { encoding: "jsonParsed" }] }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { result?: { value?: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] } };
  return (body.result?.value ?? []).reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

// The address on the seller's chain that a top-up should be sent to.
export const ownAddress = (entry: PaymentRequirements, addrs: WalletAddresses) => (entry.network === SOLANA_MAINNET ? addrs.solana : addrs.evm);
