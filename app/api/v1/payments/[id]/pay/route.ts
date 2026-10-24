import { requireSession, route } from "@/server/http";
import { approvedTeamRequest } from "@/server/payments";
import { payTeamRequest } from "@/server/transfers";
import { payPurchase, purchaseFor } from "@/server/x402-client";

// The treasury owner pays an approved team request from their private balance.
// An agent's x402 purchase is paid to the seller's quoted deposit address instead.
export const POST = route<{ id: string }>(async (_r, { id }) => {
  const session = await requireSession();
  if (await purchaseFor(id)) return { transfer: await payPurchase(session, await approvedTeamRequest(session, id)) };
  return { transfer: await payTeamRequest(session, id) };
});
