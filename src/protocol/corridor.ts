// What a team payment is made of on each network.
//
// Mainnet pays USDC out to an address on Base, through NEAR Intents, from the owner's private balance.
// Testnet has no NEAR Intents, so it pays real testnet NEAR to a NEAR account, straight from the
// owner's wallet. Both are real payments; the unit and the kind of recipient differ.
import type { Network } from "./networks";

export type Corridor = {
  id: string;
  network: Network;
  symbol: string;
  decimals: number;
  recipient: "evm" | "near";
  recipientLabel: string; // "a Base address", "a NEAR account"
  routeLabel: string;
};

export const USDC_NEAR_TO_BASE = {
  assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  destinationAssetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
};

const CORRIDORS: Record<Network, Corridor> = {
  mainnet: { id: "usdc-near-base", network: "mainnet", symbol: "USDC", decimals: 6, recipient: "evm", recipientLabel: "a Base address", routeLabel: "USDC on Base" },
  testnet: { id: "near-testnet", network: "testnet", symbol: "NEAR", decimals: 24, recipient: "near", recipientLabel: "a NEAR testnet account", routeLabel: "NEAR on testnet" },
};

export const corridorFor = (network: Network): Corridor => CORRIDORS[network];
export const corridorById = (id: string): Corridor | undefined => Object.values(CORRIDORS).find((c) => c.id === id);
