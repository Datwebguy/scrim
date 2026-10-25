import { requireSession, route } from "@/server/http";
import { walletActivity } from "@/server/wallet-activity";

// GET: the signed-in wallet's own public transactions, newest first.
export const GET = route(async () => {
  const session = await requireSession();
  return { activity: await walletActivity(session.network, session.accountId) };
});
