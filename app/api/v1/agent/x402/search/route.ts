import { agentFromApiKey } from "@/server/agents";
import { route } from "@/server/http";
import { findPaidApis } from "@/server/x402-client";

// Agent-facing: GET ?q=weather — paid x402 APIs from the public catalog, with price and whether this agent can pay.
export const GET = route(async (request) => {
  await agentFromApiKey(request.headers.get("authorization"));
  const params = new URL(request.url).searchParams;
  return { results: await findPaidApis(params.get("q") ?? "", Number(params.get("limit") ?? 10)) };
}, { browser: false });
