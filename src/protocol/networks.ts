// The two NEAR networks Scrim runs on. A person chooses one when they sign in.
//
// NEAR Intents (the private ledger, swaps and bridge) exists on mainnet only: NEAR's own docs say
// "there is no testnet deployment and no plans for one." So private money is mainnet-only, and
// testnet is for everything that has a real testnet behind it: accounts, wallets, team approvals,
// spending limits and real NEAR transfers.

export const NETWORKS = ["mainnet", "testnet"] as const;
export type Network = (typeof NETWORKS)[number];

export const isNetwork = (value: unknown): value is Network => value === "mainnet" || value === "testnet";

export const NETWORK_INFO: Record<Network, { label: string; explorerUrl: string; privateMoney: boolean }> = {
  mainnet: { label: "Mainnet", explorerUrl: "https://nearblocks.io", privateMoney: true },
  testnet: { label: "Testnet", explorerUrl: "https://testnet.nearblocks.io", privateMoney: false },
};

export const PRIVATE_MONEY_MAINNET_ONLY =
  "Private money runs on NEAR mainnet. NEAR Intents has no testnet, so adding money, swaps, payment links and proofs are mainnet-only.";
