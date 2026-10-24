import { currentSession, route } from "@/server/http";

export const GET = route(async () => {
  const session = await currentSession();
  return session ? { accountId: session.accountId, network: session.network, expiresAt: session.expiresAt } : { accountId: null };
});
