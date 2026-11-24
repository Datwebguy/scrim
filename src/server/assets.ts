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

// The chain id each EVM network uses, so a connected wallet can pay a deposit in one tap. NEAR Intents closed
// its bridge API on 11 Nov 2026; every token, chain and deposit address now comes from 1Click.
export const EVM_CHAIN_IDS: Record<string, number> = {
  eth: 1, base: 8453, arb: 42161, op: 10, pol: 137, bsc: 56, avax: 43114, gnosis: 100, scroll: 534352, bera: 80094, xlayer: 196, abs: 2741,
};
// Where money can come in from: "eth:<chain id>" for EVM networks, "<chain>:mainnet" for the rest. Coins on NEAR
// arrive straight in the wallet instead.
function depositChainOf(slug: string): string | null {
  if (slug === "near") return null;
  return EVM_CHAIN_IDS[slug] ? `eth:${EVM_CHAIN_IDS[slug]}` : `${slug}:mainnet`;
}

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
  return { name: KNOWN_CHAIN_NAMES[slug] ?? slug.toUpperCase(), icon: null };
}

// Names to fall back on when CoinGecko can't be reached, so a busy or down CoinGecko never shows "BASE" or "ARB".
const KNOWN_CHAIN_NAMES: Record<string, string> = {
  eth: "Ethereum", base: "Base", arb: "Arbitrum One", op: "OP Mainnet", pol: "Polygon POS", bsc: "BNB Smart Chain", avax: "Avalanche",
  gnosis: "Gnosis Chain", scroll: "Scroll", bera: "Berachain", sol: "Solana", btc: "Bitcoin", near: "NEAR Protocol", tron: "TRON", ton: "TON",
  sui: "Sui", aptos: "Aptos", xrp: "XRP Ledger", doge: "Dogecoin", zec: "Zcash", ltc: "Litecoin", bch: "Bitcoin Cash", stellar: "Stellar",
  cardano: "Cardano", starknet: "Starknet", monad: "Monad", hood: "Robinhood Chain", xlayer: "X Layer", plasma: "Plasma", abs: "Abstract",
};

const catalogMemo = memo(5 * 60_000, async (): Promise<Asset[]> => {
  const [list, plats, byId] = await Promise.all([oneClickTokens(), platforms().catch(() => [] as Platform[]), markets().catch(() => new Map<string, Market>())]);
  const bySlug = new Map<string, TokenInfo[]>();
  for (const t of list) bySlug.set(t.blockchain, [...(bySlug.get(t.blockchain) ?? []), t]);
  const facts = new Map<string, { name: string; icon: string | null }>();
  for (const [slug, onChain] of bySlug) {
    const ids = new Set([depositChainOf(slug)].filter((id): id is string => Boolean(id)));
    facts.set(slug, chainFacts(slug, onChain, ids, plats, byId));
  }
  return list
    .map((t): Asset => {
      const f = facts.get(t.blockchain)!;
      return {
        assetId: t.assetId, symbol: t.symbol, decimals: t.decimals, priceUsd: t.price > 0 ? t.price : null, icon: tokenIcon(t, byId),
        chain: t.blockchain, chainName: f.name, chainIcon: f.icon, depositChain: depositChainOf(t.blockchain), minDeposit: null,
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
  // Zcash: a transparent address (t1, t3), a shielded Sapling address (zs1), or a unified address (u1), which can
  // hold a shielded Orchard receiver and runs to a couple of hundred characters.
  zec: /^(t[13][1-9A-HJ-NP-Za-km-z]{33}|zs1[02-9ac-hj-np-z]{75}|u1[02-9ac-hj-np-z]{80,500})$/,
  stellar: /^G[A-Z2-7]{55}$/,
};

// A Stellar account address carries a version byte and a CRC16 checksum, so a mistyped one can be caught here.
function stellarChecksumOk(address: string): boolean {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const ch of address) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  if (bytes.length !== 35 || bytes[0] !== 6 << 3) return false;
  let crc = 0;
  for (const b of bytes.slice(0, 33)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return bytes[33] === (crc & 0xff) && bytes[34] === crc >> 8;
}
const LONG_ADDRESS_CHAINS = new Set(["zec"]);

// Chains whose one-time deposit addresses need a memo sent with the payment.
const MEMO_DEPOSIT_CHAINS = new Set(["stellar"]);
export const depositModeFor = (asset: Pick<Asset, "chain">) => (MEMO_DEPOSIT_CHAINS.has(asset.chain) ? { depositMode: "MEMO" as const } : {});

export function checkAddress(asset: Pick<Asset, "chain" | "chainName" | "depositChain">, address: string): string {
  const value = address.trim();
  if (!value || value.length > (LONG_ADDRESS_CHAINS.has(asset.chain) ? 512 : 128) || /\s/.test(value)) throw badRequest("Enter a valid address.");
  const isEvm = asset.depositChain?.startsWith("eth:") ?? false;
  const shape = isEvm ? /^0x[0-9a-fA-F]{40}$/ : SHAPES[asset.chain];
  if ((shape && !shape.test(value)) || (asset.chain === "stellar" && !stellarChecksumOk(value))) throw badRequest(`That doesn't look like a ${asset.chainName} address.`);
  return asset.chain === "near" ? value.toLowerCase() : value;
}

// The native NEAR coin's logo and mainnet price, from CoinGecko.
export const nearCoin = memo(6 * 3_600_000, async () => {
  const [coin] = await getJson<(Market & { current_price?: number })[]>(`${config.coinGeckoUrl}/coins/markets?vs_currency=usd&ids=near`, 21_600);
  return coin ? { icon: small(coin.image), name: coin.name, priceUsd: coin.current_price ?? null } : null;
});

export { getJson, memo };
