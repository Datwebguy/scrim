import { agentFromApiKey } from "@/server/agents";
import { readJson, route } from "@/server/http";
import { checkAgentPayment } from "@/server/payments";

// Agent-facing. "Would this be allowed?" Nothing is requested, saved or sent.
export const POST = route(async (request) => {
  const agent = await agentFromApiKey(request.headers.get("authorization"));
  const body = await readJson(request);
  return checkAgentPayment(agent, { recipient: String(body.recipient ?? ""), amount: String(body.amount ?? "") });
}, { browser: false });
