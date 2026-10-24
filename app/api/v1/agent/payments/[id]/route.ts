import { agentView } from "@/server/agent-api";
import { agentFromApiKey } from "@/server/agents";
import { route } from "@/server/http";
import { getAgentPayment } from "@/server/payments";

// Agent-facing: one of this agent's own requests.
export const GET = route<{ id: string }>(async (request, { id }) => {
  const agent = await agentFromApiKey(request.headers.get("authorization"));
  return { payment: agentView(await getAgentPayment(agent, id)) };
}, { browser: false });
