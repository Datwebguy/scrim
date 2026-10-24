import { catalog } from "@/server/assets";
import { requireSession, route } from "@/server/http";

// Live coin list for mainnet: prices from NEAR Intents, logos and chain names from CoinGecko.
export const GET = route(async () => {
  await requireSession();
  const assets = await catalog();
  return { assets: assets.map(({ assetId, symbol, decimals, priceUsd, icon, chain, chainName, chainIcon, depositChain }) => ({ assetId, symbol, decimals, priceUsd, icon, chain, chainName, chainIcon, canAdd: Boolean(depositChain) })) };
});
