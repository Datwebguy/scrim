import { readJson, route } from "@/server/http";
import { linkRow } from "@/server/paylinks";
import { createLinkPayment } from "@/server/transfers";

// Public. Starts a payment from any chain and returns where to send it.
export const POST = route<{ code: string }>(async (request, { code }) => {
  const b = await readJson(request);
  const payment = await createLinkPayment(await linkRow(code), { fromAssetId: String(b.fromAssetId ?? ""), refundAddress: String(b.refundAddress ?? "") });
  return { payment: { id: payment.id, status: payment.status, deposit: payment.deposit, amountIn: payment.amountIn, fromAsset: payment.fromAsset, expiresAt: payment.expiresAt } };
}, { browser: true });
