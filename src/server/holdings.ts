// A person's public on-chain holdings on either network: native NEAR plus every token contract they
// hold, with each token's name, symbol, decimals and logo read from the token contract itself.
import { formatBalance } from "@/protocol/amount";
import type { Network } from "@/protocol/networks";
import { catalog, getJson, memo, nearCoin } from "./assets";
import { endpoints } from "./config";
import { rpcQuery, viewCall } from "./near-rpc";

export type PublicHolding = {
  id: string; // "near" or the token contract
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  display: string;
  icon: string | null;
  usd: number | null; // the dollar value of the amount, when a price is known
};

// The coins people most often hold in a wallet on mainnet. The indexer can be slow to list a token a
// wallet just received, so these are always read straight from their contracts.
const ALWAYS_CHECK: Record<Network, string[]> = {
  mainnet: ["17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", "usdt.tether-token.near", "wrap.near"],
  testnet: [],
};

type FtMetadata = { name: string; symbol: string; decimals: number; icon?: string | null };

const metadataCache = new Map<string, { at: number; value: FtMetadata | null }>();

async function tokenMetadata(network: Network, contract: string): Promise<FtMetadata | null> {
  const key = `${network}:${contract}`;
  const hit = metadataCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.value;
  let value: FtMetadata | null = null;
  try {
    value = await viewCall<FtMetadata>(network, contract, "ft_metadata");
  } catch {
    value = null; // Not a standard token contract; skip it.
  }
  metadataCache.set(key, { at: Date.now(), value });
  return value;
}

// Token logos live on chain as a web address or an embedded image. Accept only safe, small images.
function safeIcon(icon: string | null | undefined): string | null {
  if (!icon) return null;
  if (/^https:\/\/[^\s"'<>]{1,500}$/.test(icon)) return icon;
  if (icon.length <= 100_000 && /^data:image\/(png|jpeg|gif|webp|svg\+xml)(;charset=[\w-]+)?;(base64,[A-Za-z0-9+/=]+|utf8,[^\s]+|[^,]*,[^\s]+)$/i.test(icon)) return icon;
  return null;
}

const nativeBalance = async (network: Network, accountId: string): Promise<string> => {
  try {
    const full = await getJson<{ state?: { balance: string } }>(`${endpoints(network).indexerUrl}/v1/account/${accountId}/full`, 0);
    if (full.state?.balance !== undefined) return full.state.balance;
  } catch {
    // Fall through to the node.
  }
  const account = await rpcQuery<{ amount: string }>(network, { request_type: "view_account", account_id: accountId });
  return account.result?.amount ?? "0";
};

export async function publicHoldings(network: Network, accountId: string): Promise<PublicHolding[]> {
  const [native, coin, tokens] = await Promise.all([
    nativeBalance(network, accountId),
    nearCoin().catch(() => null),
    getJson<{ tokens?: { contract_id: string; balance: string }[] }>(`${endpoints(network).indexerUrl}/v1/account/${accountId}/ft`, 0).catch(() => ({ tokens: [] as { contract_id: string; balance: string }[] })),
  ]);
  const prices = network === "mainnet" ? await catalog().then((list) => new Map(list.map((a) => [a.assetId, a.priceUsd]))).catch(() => new Map<string, number | null>()) : new Map<string, number | null>();
  const value = (assetId: string, amount: string, decimals: number) => {
    const p = prices.get(assetId);
    return p == null ? null : (Number(amount) / 10 ** decimals) * p;
  };
  const holdings: PublicHolding[] = [{ id: "near", symbol: "NEAR", name: "NEAR", decimals: 24, amount: native, display: formatBalance(BigInt(native), 24), icon: coin?.icon ?? null, usd: value("nep141:wrap.near", native, 24) }];
  const listed = new Map((tokens.tokens ?? []).map((t) => [t.contract_id, t.balance || "0"]));
  // Read the common coins from the chain itself: the contract's own answer wins over the indexer's.
  await Promise.all(ALWAYS_CHECK[network].map(async (contract) => {
    try {
      const balance = await viewCall<string>(network, contract, "ft_balance_of", { account_id: accountId });
      if (typeof balance === "string" && /^\d+$/.test(balance)) listed.set(contract, balance);
    } catch {
      // Leave whatever the indexer said.
    }
  }));
  const held = [...listed].map(([contract_id, balance]) => ({ contract_id, balance })).filter((t) => BigInt(t.balance || "0") > 0n).slice(0, 25);
  const metadata = await Promise.all(held.map((t) => tokenMetadata(network, t.contract_id)));
  held.forEach((t, i) => {
    const m = metadata[i];
    if (!m) return;
    holdings.push({ id: t.contract_id, symbol: m.symbol, name: m.name, decimals: m.decimals, amount: t.balance, display: formatBalance(BigInt(t.balance), m.decimals), icon: safeIcon(m.icon), usd: value(`nep141:${t.contract_id}`, t.balance, m.decimals) });
  });
  return holdings;
}

export async function accountExists(network: Network, accountId: string): Promise<boolean> {
  const account = await rpcQuery<{ amount?: string }>(network, { request_type: "view_account", account_id: accountId });
  return account.result?.amount !== undefined;
}
