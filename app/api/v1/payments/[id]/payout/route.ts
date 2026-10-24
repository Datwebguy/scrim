import { readJson, requireSession, route } from "@/server/http";
import { recordTestnetPayout } from "@/server/payments";

// Testnet: the owner paid from their wallet. Verify the transaction on chain and mark the request paid.
export const POST = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = await readJson(request);
  return { payment: await recordTestnetPayout(session, id, String(body.txHash ?? "")) };
});
