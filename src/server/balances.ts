import { formatAmount } from "@/protocol/amount";
import { catalog, usdValue } from "./assets";
import type { Session } from "./auth";
import * as oneclick from "./oneclick";
import { privateAccessToken, privateStatus } from "./private-access";

type Holding = { assetId: string; symbol: string; chainName: string; amount: string; display: string; usd: number | null; icon: string | null; chainIcon: string | null };
export type Overview = { status: Awaited<ReturnType<typeof privateStatus>>["status"]; detail: string | null; publicKey: string | null; totalUsd: number; holdings: Holding[] };

export async function overview(session: Session): Promise<Overview> {
  const access = await privateStatus(session);
  if (access.status !== "active") return { status: access.status, detail: access.detail, publicKey: access.publicKey, totalUsd: 0, holdings: [] };
  const [{ balances }, assets] = await Promise.all([oneclick.balances(await privateAccessToken(session)), catalog()]);
  const holdings: Holding[] = [];
  for (const b of balances) {
    const minor = BigInt(b.available);
    if (minor === 0n) continue;
    const asset = assets.find((a) => a.assetId === b.tokenId);
    if (!asset) continue;
    holdings.push({
      assetId: asset.assetId, symbol: asset.symbol, chainName: asset.chainName, amount: minor.toString(),
      display: formatAmount(minor, asset.decimals, 2), usd: asset.priceUsd === null ? null : usdValue(asset, minor), icon: asset.icon, chainIcon: asset.chainIcon,
    });
  }
  holdings.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  return { status: "active", detail: null, publicKey: access.publicKey, totalUsd: holdings.reduce((sum, h) => sum + (h.usd ?? 0), 0), holdings };
}
