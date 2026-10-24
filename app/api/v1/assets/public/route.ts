import { catalog } from "@/server/assets";
import { route } from "@/server/http";

// Public: a payer chooses which coin to pay with. Only coins that can be paid from are listed.
export const GET = route(async () => {
  const assets = await catalog();
  return { assets: assets.filter((a) => a.depositChain).map(({ assetId, symbol, decimals, priceUsd, icon, chain, chainName, chainIcon }) => ({ assetId, symbol, decimals, priceUsd, icon, chain, chainName, chainIcon, canAdd: true })) };
});
