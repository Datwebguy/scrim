import { rotateAgentKey } from "@/server/agents";
import { requireSession, route } from "@/server/http";

// POST: issue a new key for this agent. The old key stops working immediately.
export const POST = route<{ id: string }>(async (_request, { id }) => rotateAgentKey(await requireSession(), id));
