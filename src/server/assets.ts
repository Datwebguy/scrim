// The asset catalog for mainnet: every coin on every chain Scrim can receive, hold and pay out.
// Everything here is live: token list and prices from NEAR Intents, deposit details from its bridge,
// logos and chain names from CoinGecko. Nothing about a token is written into the code.
import { config } from "./config";
import { badRequest } from "./errors";
import { tokens as oneClickTokens, type TokenInfo } from "./oneclick";

export type Asset = {
  assetId: string;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
  icon: string | null;
  chain: string; // NEAR Intents chain id, e.g. "base"
  chainName: string;
  chainIcon: string | null;
  depositChain: string | null; // bridge chain id, e.g. "eth:8453"
  minDeposit: string | null;
};

const HEADERS = { "user-agent": "scrim", accept: "application/json" };

// A small memo with a stale fallback, so a brief outage of a data source doesn't blank the app.
function memo<T>(ttlMs: number, load: () => Promise<T>) {
  let value: { at: number; data: T } | null = null;
  let inflight: Promise<T> | null = null;
  return async (): Promise<T> => {
    if (value && Date.now() - value.at < ttlMs) return value.data;
    inflight ??= load()
      .then((data) => { value = { at: Date.now(), data }; return data; })
      .catch((error) => { if (value) return value.data; throw error; })
      .finally(() => { inflight = null; });
    return inflight;
  };
}

async function getJson<T>(url: string, revalidate: number, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000), next: { revalidate } } as RequestInit);
  if (!response.ok) throw new Error(`${new URL(url).host} responded ${response.status}`);
  return (await response.json()) as T;
}

type BridgeToken = { defuse_asset_identifier: string; intents_token_id: string; min_deposit_amount?: string };

const bridgeTokens = memo(10 * 60_000, async () => {
  const payload = await getJson<{ result?: { tokens: BridgeToken[] } }>(config.bridgeRpcUrl, 600, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "supported_tokens", params: [{}] }),
  });
  return payload.result?.tokens ?? [];
});

type Platform = { id: string; chain_identifier: number | null; name: string; shortname: string; image?: { small?: string } };
const platforms = memo(6 * 3_600_000, () => getJson<Platform[]>(`${config.coinGeckoUrl}/asset_platforms`, 21_600));

type Market = { id: string; name: string; image: string };
const markets = memo(6 * 3_600_000, async () => {
  const list = await oneClickTokens();
  const ids = [...new Set(list.map((t) => t.coingeckoId).filter((id): id is string => Boolean(id)))];
  const out = new Map<string, Market>();
  for (let i = 0; i < ids.length; i += 250) {
    const page = await getJson<Market[]>(`${config.coinGeckoUrl}/coins/markets?vs_currency=usd&per_page=250&ids=${ids.slice(i, i + 250).join(",")}`, 21_600);
    for (const m of page) out.set(m.id, m);
  }
  return out;
});

const small = (url: string) => url.replace("/large/", "/small/");

// A token's logo is its CoinGecko image. Tokens CoinGecko doesn't list have none, and show a letter.
function tokenIcon(token: TokenInfo, byId: Map<string, Market>): string | null {
  const m = token.coingeckoId ? byId.get(token.coingeckoId) : undefined;
  return m?.image ? small(m.image) : null;
}

// A chain's name and logo come from its CoinGecko platform (matched by EVM chain id, or by slug),
// or from its own native coin. Chains with no match show their id and a letter.
function chainFacts(slug: string, tokensOnChain: TokenInfo[], bridgeIds: Set<string>, plats: Platform[], byId: Map<string, Market>) {
  const evmIds = [...bridgeIds].filter((id) => id.startsWith("eth:") && /^\d+$/.test(id.split(":")[1]));
  if (evmIds.length === 1) {
    const platform = plats.find((p) => p.chain_identifier === Number(evmIds[0].split(":")[1]));
    if (platform) return { name: platform.name, icon: platform.image?.small ?? null };
  }
  const platform = plats.find((p) => p.id === slug || p.shortname?.toLowerCase() === slug);
  if (platform) return { name: platform.name, icon: platform.image?.small ?? null };
  const ownsCoin = [...bridgeIds].some((id) => id === `${slug}:mainnet`);
  const native = ownsCoin ? tokensOnChain.find((t) => !t.contractAddress && t.coingeckoId && byId.has(t.coingeckoId)) : undefined;
  if (native) {
    const m = byId.get(native.coingeckoId!)!;
    return { name: m.name, icon: small(m.image) };
  }
  return { name: slug.toUpperCase(), icon: null };
}

const catalogMemo = memo(5 * 60_000, async (): Promise<Asset[]> => {
  const [list, bridge, plats, byId] = await Promise.all([oneClickTokens(), bridgeTokens(), platforms().catch(() => [] as Platform[]), markets().catch(() => new Map<string, Market>())]);
  const bridgeById = new Map<string, { chainId: string; min: string | null }>();
  for (const b of bridge) {
    const [kind, id] = b.defuse_asset_identifier.split(":");
    if (!bridgeById.has(b.intents_token_id)) bridgeById.set(b.intents_token_id, { chainId: `${kind}:${id}`, min: b.min_deposit_amount ?? null });
  }
  const bySlug = new Map<string, TokenInfo[]>();
  for (const t of list) bySlug.set(t.blockchain, [...(bySlug.get(t.blockchain) ?? []), t]);
  const facts = new Map<string, { name: string; icon: string | null }>();
  for (const [slug, onChain] of bySlug) {
    const ids = new Set(onChain.map((t) => bridgeById.get(t.assetId)?.chainId).filter((id): id is string => Boolean(id)));
    facts.set(slug, chainFacts(slug, onChain, ids, plats, byId));
  }
  return list
    .map((t): Asset => {
      const b = bridgeById.get(t.assetId);
      const f = facts.get(t.blockchain)!;
      return {
        assetId: t.assetId, symbol: t.symbol, decimals: t.decimals, priceUsd: t.price > 0 ? t.price : null, icon: tokenIcon(t, byId),
        chain: t.blockchain, chainName: f.name, chainIcon: f.icon, depositChain: b?.chainId ?? null, minDeposit: b?.min ?? null,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.chainName.localeCompare(b.chainName));
});

export const catalog = catalogMemo;

export async function assetById(assetId: string): Promise<Asset> {
  const asset = (await catalog()).find((a) => a.assetId === assetId);
  if (!asset) throw badRequest("That asset is not supported.");
  return asset;
}

export function usdValue(asset: Asset, minor: bigint): number {
  return asset.priceUsd === null ? 0 : (Number(minor) / 10 ** asset.decimals) * asset.priceUsd;
}

// Per-chain address shape checks, so obvious mistakes are caught before money moves.
const SHAPES: Record<string, RegExp> = {
  btc: /^(bc1[0-9a-z]{25,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  sol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  near: /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/,
};

export function checkAddress(asset: Pick<Asset, "chain" | "chainName" | "depositChain">, address: string): string {
  const value = address.trim();
  if (!value || value.length > 128 || /\s/.test(value)) throw badRequest("Enter a valid address.");
  const isEvm = asset.depositChain?.startsWith("eth:") ?? false;
  const shape = isEvm ? /^0x[0-9a-fA-F]{40}$/ : SHAPES[asset.chain];
  if (shape && !shape.test(value)) throw badRequest(`That doesn't look like a ${asset.chainName} address.`);
  return asset.chain === "near" ? value.toLowerCase() : value;
}

// The native NEAR coin's logo and mainnet price, from CoinGecko.
export const nearCoin = memo(6 * 3_600_000, async () => {
  const [coin] = await getJson<(Market & { current_price?: number })[]>(`${config.coinGeckoUrl}/coins/markets?vs_currency=usd&ids=near`, 21_600);
  return coin ? { icon: small(coin.image), name: coin.name, priceUsd: coin.current_price ?? null } : null;
});

export { getJson, memo };
