// Supported settlement corridors. Phase A ships exactly one.

export type Corridor = {
  id: string;
  label: string;
  source: { network: "near"; asset: "USDC"; assetId: string; decimals: number };
  destination: { network: "base"; asset: "USDC"; assetId: string; decimals: number; chainId: number };
};

export const USDC_NEAR_TO_BASE: Corridor = {
  id: "usdc-near-base",
  label: "USDC · NEAR → Base",
  source: {
    network: "near",
    asset: "USDC",
    assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    decimals: 6,
  },
  destination: {
    network: "base",
    asset: "USDC",
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    decimals: 6,
    chainId: 8453,
  },
};
