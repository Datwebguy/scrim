import { pauseAllAgents } from "@/server/agents";
import { requireSession, route } from "@/server/http";

// Pauses every agent on this account at once.
export const POST = route<{ id: string }>(async (_request, { id }) => {
  const session = await requireSession();
  return pauseAllAgents(session, id);
});
