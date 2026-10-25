import { badRequest } from "@/server/errors";
import { readJson, requireSession, route } from "@/server/http";
import { approvedTeamRequest } from "@/server/payments";
import { payTeamRequest } from "@/server/transfers";
import { payPurchase, purchaseFor } from "@/server/x402-client";

// The owner pays an approved request, from their private balance or (body { from: "wallet" }) their wallet.
// An agent's x402 purchase is paid to the seller's quoted deposit address from the private balance.
export const POST = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = (await readJson(request).catch(() => ({}))) as { from?: unknown };
  const fromWallet = body.from === "wallet";
  if (await purchaseFor(id)) {
    if (fromWallet) throw badRequest("Purchases are paid from the private balance.");
    return { transfer: await payPurchase(session, await approvedTeamRequest(session, id)) };
  }
  return { transfer: await payTeamRequest(session, id, fromWallet ? "public" : "private") };
});
