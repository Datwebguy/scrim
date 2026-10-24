import { agentFromApiKey } from "@/server/agents";
import { readJson, route } from "@/server/http";
import { createAgentPayment, listAgentPayments } from "@/server/payments";

// Agent-facing. Agents authenticate with a Bearer key and can only create request-only payments
// that are evaluated against their mandate and then wait for human approval.
export const POST = route(async (request) => {
  const agent = await agentFromApiKey(request.headers.get("authorization"));
  const body = await readJson(request);
  const payment = await createAgentPayment(agent, {
    recipient: String(body.recipient ?? ""),
    amount: String(body.amount ?? ""),
    memo: String(body.memo ?? ""),
    idempotencyKey: request.headers.get("idempotency-key") ?? "",
  });
  const { approvals: _approvals, ...visible } = payment;
  return { payment: visible };
}, { browser: false });

export const GET = route(async (request) => {
  const agent = await agentFromApiKey(request.headers.get("authorization"));
  return { payments: (await listAgentPayments(agent)).map(({ approvals: _a, ...p }) => p) };
}, { browser: false });
