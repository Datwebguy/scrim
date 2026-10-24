import { catalog } from "@/server/assets";
import { requireSession, route } from "@/server/http";

export const GET = route(async () => {
  await requireSession();
  const assets = await catalog();
  return { assets: assets.map(({ assetId, symbol, network, networkName, decimals, priceUsd, depositChain }) => ({ assetId, symbol, network, networkName, decimals, priceUsd, canAdd: Boolean(depositChain) })) };
});
