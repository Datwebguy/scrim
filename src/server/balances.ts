import { formatAmount } from "@/protocol/amount";
import { catalog, usdValue } from "./assets";
import type { Session } from "./auth";
import * as oneclick from "./oneclick";
import { privateAccessToken, privateStatus } from "./private-access";

export type Holding = { assetId: string; symbol: string; networkName: string; amount: string; display: string; usd: number };
export type Overview = { status: Awaited<ReturnType<typeof privateStatus>>["status"]; detail: string | null; totalUsd: number; holdings: Holding[] };

export async function overview(session: Session): Promise<Overview> {
  const access = await privateStatus(session);
  if (access.status !== "active") return { status: access.status, detail: access.detail, totalUsd: 0, holdings: [] };
  const [{ balances }, assets] = await Promise.all([oneclick.balances(await privateAccessToken(session)), catalog()]);
  const holdings: Holding[] = [];
  for (const b of balances) {
    const minor = BigInt(b.available);
    if (minor === 0n) continue;
    const asset = assets.find((a) => a.assetId === b.tokenId);
    if (!asset) continue;
    holdings.push({
      assetId: asset.assetId, symbol: asset.symbol, networkName: asset.networkName, amount: minor.toString(),
      display: formatAmount(minor, asset.decimals, 2), usd: usdValue(asset, minor),
    });
  }
  holdings.sort((a, b) => b.usd - a.usd);
  return { status: "active", detail: null, totalUsd: holdings.reduce((sum, h) => sum + h.usd, 0), holdings };
}
