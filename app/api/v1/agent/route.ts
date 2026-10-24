import { agentFromApiKey, agentSpendInWindow } from "@/server/agents";
import { sql } from "@/server/db";
import { route } from "@/server/http";

// Agent-facing: returns the calling agent's active mandate and remaining budget.
export const GET = route(async (request) => {
  const agent = await agentFromApiKey(request.headers.get("authorization"));
  const spent = await agentSpendInWindow(sql, agent.id, agent.policy.rollingCap.windowSeconds);
  const remaining = BigInt(agent.policy.rollingCap.amount) - spent;
  return {
    agent: { id: agent.id, name: agent.name, mode: agent.mode, enabled: agent.enabled },
    mandate: { ...agent.policy, commitment: agent.policyCommitment },
    budget: { committedInWindow: spent.toString(), remainingInWindow: (remaining > 0n ? remaining : 0n).toString(), decimals: 6 },
  };
}, { browser: false });
