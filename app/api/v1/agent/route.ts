import { agentOverview } from "@/server/agent-api";
import { agentFromApiKey } from "@/server/agents";
import { route } from "@/server/http";

// Agent-facing: the calling agent's limits and what is left to spend in the current window.
export const GET = route(async (request) => agentOverview(await agentFromApiKey(request.headers.get("authorization"))), { browser: false });
