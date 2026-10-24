import { agentView } from "@/server/agent-api";
import { agentFromApiKey } from "@/server/agents";
import { route } from "@/server/http";
import { getAgentPayment } from "@/server/payments";
import { syncAgentPayout } from "@/server/agent-wallets";
import { deliverPurchase } from "@/server/x402-client";

// Agent-facing: one of this agent's own requests.
export const GET = route<{ id: string }>(async (request, { id }) => {
  const agent = await agentFromApiKey(request.headers.get("authorization"));
  await syncAgentPayout((await getAgentPayment(agent, id)).id); // a payment the agent's own wallet is still sending
  const payment = await getAgentPayment(agent, id);
  // For an x402 purchase, also try to collect what was bought if it is paid but not yet delivered.
  return { payment: agentView(payment), purchase: await deliverPurchase(payment.id) };
}, { browser: false });
