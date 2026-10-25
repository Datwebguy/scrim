import { randomUUID } from "node:crypto";
import { agentOverview, agentView } from "./agent-api";
import { agentFromApiKey, type Agent } from "./agents";
import { HttpError } from "./errors";
import { createAgentPayment, getAgentPayment, listAgentPayments } from "./payments";
import { deliverPurchase, findPaidApis, requestPurchase } from "./x402-client";
import { syncAgentPayout } from "./agent-wallets";

// A Model Context Protocol server (Streamable HTTP, stateless, JSON responses).
// AI agents connect with their Scrim agent key as a Bearer token and get four tools.
// The tools can only ask to pay; people still approve every payment.

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const TOOLS = [
  {
    name: "get_limits",
    title: "Check limits and budget",
    description: "Shows this agent's spending limits, who it may pay, and how much it can still ask for in the current window.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "request_payment",
    title: "Ask to pay",
    description:
      "Asks the team to pay a recipient. Scrim checks the request against this agent's limits first; requests outside them are stopped. Requests inside them wait for people on the team to approve. This never moves money by itself.",
    inputSchema: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "Who to pay. Must be on this agent's list of allowed recipients." },
        amount: { type: "string", description: "Amount as a decimal string, for example \"25\" or \"12.50\"." },
        memo: { type: "string", description: "Optional note, up to 140 characters." },
        idempotency_key: { type: "string", description: "Optional. Reuse the same value when retrying so the payment is only requested once (8–100 characters)." },
      },
      required: ["recipient", "amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "find_paid_apis",
    title: "Find paid APIs",
    description:
      "Searches the public x402 catalog for paid APIs and data (for example \"weather\", \"company data\", \"translation\"). Each result has its address, price in US dollars, the chains it takes and whether this agent can pay it: \"private\" (paid privately through NEAR Intents), \"wallet\" (paid from this agent's own wallet), or null. Add a result's https:// site to the agent's allowed recipients, then call pay_x402 with its address.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What you're looking for, in a few words." },
        limit: { type: "integer", description: "Optional. How many results, 1–20 (default 10)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "pay_x402",
    title: "Buy from an x402 seller",
    description:
      "Buys from an x402 (HTTP 402) address, such as a paid API. Scrim reads the seller's price and checks it against this agent's limits (the seller's https:// address must be an allowed recipient). People approve it, or, if this agent pays by itself, Scrim pays at once from its own wallet. Call get_payment to follow it and read what the seller returned.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full https:// address that answers 402 Payment Required." },
        idempotency_key: { type: "string", description: "Optional. Reuse when retrying so it is only requested once (8–100 characters)." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "list_payments",
    title: "List my requests",
    description: "Lists this agent's recent payment requests and where each one stands.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_payment",
    title: "Check a request",
    description: "Shows one payment request: waiting for approval, approved, paid, stopped by limits, cancelled or failed.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "The payment request ID." } }, required: ["id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function toolResult(data: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown>, isError };
}

async function callTool(agent: Agent, name: string, args: Record<string, unknown>) {
  try {
    switch (name) {
      case "get_limits":
        return toolResult(await agentOverview(agent));
      case "request_payment": {
        const payment = await createAgentPayment(agent, {
          recipient: String(args.recipient ?? ""),
          amount: String(args.amount ?? ""),
          memo: String(args.memo ?? ""),
          idempotencyKey: String(args.idempotency_key ?? `mcp-${randomUUID()}`),
        });
        const view = agentView(payment);
        return toolResult({ payment: view, next: view.status === "policy_rejected" ? "Stopped: outside this agent's limits." : "Waiting for people on the team to approve." });
      }
      case "pay_x402": {
        const { payment, purchase } = await requestPurchase(agent, String(args.url ?? ""), String(args.idempotency_key ?? `mcp-${randomUUID()}`));
        const view = agentView(payment);
        return toolResult({ payment: view, purchase, next: view.status === "policy_rejected" ? "Stopped: outside this agent's limits." : agent.mode === "autonomous" ? "Paying from this agent's wallet. Call get_payment in a moment to read what the seller returned." : "Waiting for people on the team to approve and pay. Then call get_payment." });
      }
      case "find_paid_apis": {
        return toolResult({ results: await findPaidApis(String(args.query ?? ""), Number(args.limit ?? 10)) });
      }
      case "list_payments":
        return toolResult({ payments: (await listAgentPayments(agent)).map(agentView) });
      case "get_payment":
      {
        await syncAgentPayout((await getAgentPayment(agent, String(args.id ?? ""))).id); // a payment the agent's own wallet is still sending
        const payment = await getAgentPayment(agent, String(args.id ?? ""));
        return toolResult({ payment: agentView(payment), purchase: await deliverPurchase(payment.id) });
      }
      default:
        return null;
    }
  } catch (error) {
    if (error instanceof HttpError) return toolResult({ error: error.message }, true);
    throw error;
  }
}

async function handle(message: Rpc, authorization: string | null): Promise<object | null> {
  const { id, method, params = {} } = message;
  const isNotification = id === undefined;
  if (message.jsonrpc !== "2.0" || typeof method !== "string") return fail(id, -32600, "Invalid request.");

  switch (method) {
    case "initialize": {
      const requested = String(params.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "scrim", title: "Scrim", version: "1.0.0" },
        instructions: "Scrim lets this agent ask its team to pay someone within set limits. Call get_limits first. request_payment never moves money by itself; people approve.",
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      await agentFromApiKey(authorization);
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const agent = await agentFromApiKey(authorization);
      const result = await callTool(agent, String(params.name ?? ""), (params.arguments as Record<string, unknown>) ?? {});
      return result ? ok(id, result) : fail(id, -32602, `Unknown tool: ${String(params.name)}`);
    }
    default:
      if (isNotification) return null;
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

export async function handleMcp(body: unknown, authorization: string | null): Promise<{ status: number; body: unknown }> {
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as Rpc[];
  if (messages.length === 0 || messages.length > 20) return { status: 400, body: fail(null, -32600, "Invalid request.") };
  const replies: object[] = [];
  for (const message of messages) {
    try {
      const reply = await handle(message ?? {}, authorization);
      if (reply) replies.push(reply);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return { status: 401, body: fail(message?.id, -32001, error.message) };
      console.error("[mcp]", error);
      replies.push(fail(message?.id, -32603, "Something went wrong. Try again."));
    }
  }
  if (replies.length === 0) return { status: 202, body: null };
  return { status: 200, body: batch ? replies : replies[0] };
}
