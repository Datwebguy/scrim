// The asset catalog: every coin on every network Scrim can receive, hold, and pay out.
// Joins live prices from 1Click with deposit metadata from the bridge.
import { config } from "./config";
import { badRequest } from "./errors";
import { tokens } from "./oneclick";

export type Asset = {
  assetId: string;
  symbol: string;
  network: string; // 1Click blockchain id, e.g. "base"
  networkName: string;
  decimals: number;
  priceUsd: number;
  depositChain: string | null; // bridge chain id, e.g. "eth:8453"
  minDeposit: string | null;
};

const NETWORK_NAMES: Record<string, string> = {
  near: "NEAR", eth: "Ethereum", base: "Base", arb: "Arbitrum", op: "Optimism", pol: "Polygon", bsc: "BNB Chain",
  avax: "Avalanche", gnosis: "Gnosis", btc: "Bitcoin", sol: "Solana", ton: "TON", tron: "Tron", xrp: "XRP Ledger",
  zec: "Zcash", doge: "Dogecoin", ltc: "Litecoin", bch: "Bitcoin Cash", dash: "Dash", sui: "Sui", aptos: "Aptos",
  stellar: "Stellar", cardano: "Cardano", starknet: "Starknet", bera: "Berachain", monad: "Monad", scroll: "Scroll",
  plasma: "Plasma", xlayer: "X Layer", hood: "Robinhood Chain", movement: "Movement", aleo: "Aleo", adi: "ADI",
  hypercore: "Hyperliquid", fogo: "Fogo", qtc: "QTC", abs: "Abstract",
};

type BridgeToken = { defuse_asset_identifier: string; intents_token_id: string; min_deposit_amount?: string };

let bridgeCache: { at: number; tokens: BridgeToken[] } | null = null;
async function bridgeTokens(): Promise<BridgeToken[]> {
  if (bridgeCache && Date.now() - bridgeCache.at < 10 * 60_000) return bridgeCache.tokens;
  try {
    const response = await fetch(config.bridgeRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "supported_tokens", params: [{}] }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as { result?: { tokens: BridgeToken[] } };
    bridgeCache = { at: Date.now(), tokens: payload.result?.tokens ?? [] };
  } catch {
    bridgeCache = { at: Date.now() - 9 * 60_000, tokens: bridgeCache?.tokens ?? [] };
  }
  return bridgeCache.tokens;
}

let catalogOverride: Asset[] | null = null;
export function setCatalogForTests(assets: Asset[] | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Catalog cannot be replaced in production.");
  catalogOverride = assets;
}

export async function catalog(): Promise<Asset[]> {
  if (catalogOverride) return catalogOverride;
  const [list, bridge] = await Promise.all([tokens(), bridgeTokens()]);
  const bridgeById = new Map<string, BridgeToken>();
  for (const t of bridge) if (!bridgeById.has(t.intents_token_id)) bridgeById.set(t.intents_token_id, t);
  return list
    .map((t) => {
      const b = bridgeById.get(t.assetId);
      return {
        assetId: t.assetId,
        symbol: t.symbol,
        network: t.blockchain,
        networkName: NETWORK_NAMES[t.blockchain] ?? t.blockchain.toUpperCase(),
        decimals: t.decimals,
        priceUsd: t.price ?? 0,
        depositChain: b ? b.defuse_asset_identifier.split(":").slice(0, 2).join(":") : null,
        minDeposit: b?.min_deposit_amount ?? null,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.networkName.localeCompare(b.networkName));
}

export async function assetById(assetId: string): Promise<Asset> {
  const asset = (await catalog()).find((a) => a.assetId === assetId);
  if (!asset) throw badRequest("That asset is not supported.");
  return asset;
}

export function usdValue(asset: Asset, minor: bigint): number {
  return (Number(minor) / 10 ** asset.decimals) * asset.priceUsd;
}

// Loose per-network address checks, so obvious mistakes are caught before money moves.
const ADDRESS_RULES: Record<string, RegExp> = {
  evm: /^0x[0-9a-fA-F]{40}$/,
  btc: /^(bc1[0-9a-z]{25,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  near: /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/,
};
const EVM = new Set(["eth", "base", "arb", "op", "pol", "bsc", "avax", "gnosis", "bera", "monad", "scroll", "plasma", "xlayer", "hood", "abs", "adi"]);

export function checkAddress(network: string, address: string): string {
  const value = address.trim();
  if (!value || value.length > 128 || /\s/.test(value)) throw badRequest("Enter a valid address.");
  const rule = EVM.has(network) ? ADDRESS_RULES.evm : ADDRESS_RULES[network];
  if (rule && !rule.test(value)) throw badRequest(`That doesn't look like a ${NETWORK_NAMES[network] ?? network} address.`);
  return network === "near" ? value.toLowerCase() : value;
}
