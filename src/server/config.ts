import { isNetwork, NETWORKS, type Network } from "@/protocol/networks";

export type { Network };

const trim = (value: string | undefined) => value?.trim() || undefined;

export const config = {
  // Networks people may choose at sign-in. Default: both.
  get enabledNetworks(): Network[] {
    const list = (trim(process.env.SCRIM_NETWORKS) ?? NETWORKS.join(",")).split(",").map((n) => n.trim());
    const valid = list.filter(isNetwork);
    return valid.length ? valid : ["mainnet"];
  },
  get authRecipient(): string {
    return trim(process.env.SCRIM_AUTH_RECIPIENT) ?? "scrim.local";
  },
  // NEAR Intents (private ledger, swaps, bridge): mainnet only.
  get oneClickUrl(): string {
    return trim(process.env.ONECLICK_URL) ?? "https://1click.chaindefuser.com";
  },
  get bridgeRpcUrl(): string {
    return trim(process.env.BRIDGE_RPC_URL) ?? "https://bridge.chaindefuser.com/rpc";
  },
  // Free partner key from partners.near-intents.org. Needed to move money, not to read a balance.
  get oneClickApiKey(): string | undefined {
    return trim(process.env.ONECLICK_API_KEY);
  },
  get coinGeckoUrl(): string {
    return trim(process.env.COINGECKO_URL) ?? "https://api.coingecko.com/api/v3";
  },
  sessionTtlSeconds: 12 * 60 * 60,
  challengeTtlSeconds: 5 * 60,
  paymentTtlSeconds: 24 * 60 * 60,
  sessionCookie: "scrim_session",
};

export type Endpoints = { rpcUrl: string; indexerUrl: string };

// Real public endpoints for each network. Override with NEAR_RPC_URL_MAINNET / NEAR_RPC_URL_TESTNET.
export function endpoints(network: Network): Endpoints {
  return network === "mainnet"
    ? { rpcUrl: trim(process.env.NEAR_RPC_URL_MAINNET) ?? "https://rpc.mainnet.fastnear.com", indexerUrl: trim(process.env.NEAR_INDEXER_URL_MAINNET) ?? "https://api.fastnear.com" }
    : { rpcUrl: trim(process.env.NEAR_RPC_URL_TESTNET) ?? "https://rpc.testnet.fastnear.com", indexerUrl: trim(process.env.NEAR_INDEXER_URL_TESTNET) ?? "https://test.api.fastnear.com" };
}

export const privateTransfersEnabled = (network: Network) => network === "mainnet" && Boolean(config.oneClickApiKey);
