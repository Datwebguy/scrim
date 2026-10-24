import { publicHoldings } from "@/server/holdings";
import { requireSession, route } from "@/server/http";

// Live on-chain holdings for the signed-in account on its own network.
export const GET = route(async () => {
  const session = await requireSession();
  return { network: session.network, accountId: session.accountId, holdings: await publicHoldings(session.network, session.accountId) };
});
