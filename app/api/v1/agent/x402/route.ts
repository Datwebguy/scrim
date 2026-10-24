import { agentView } from "@/server/agent-api";
import { agentFromApiKey } from "@/server/agents";
import { badRequest } from "@/server/errors";
import { readJson, route } from "@/server/http";
import { requestPurchase } from "@/server/x402-client";

// Agent-facing: ask to buy from an x402 seller. Body { url }, header Idempotency-Key.
// Becomes a team payment request under the agent's limits; people approve, then Scrim pays privately.
export const POST = route(async (request) => {
  const agent = await agentFromApiKey(request.headers.get("authorization"));
  const body = await readJson(request);
  if (typeof body.url !== "string") throw badRequest("Provide the url to buy.");
  const key = request.headers.get("idempotency-key") ?? "";
  if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw badRequest("Provide an Idempotency-Key header (8–100 characters).", "idempotency_key_required");
  const { payment, purchase } = await requestPurchase(agent, body.url, key);
  return { payment: agentView(payment), purchase };
}, { browser: false });
