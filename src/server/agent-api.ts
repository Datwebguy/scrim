import { formatAmount } from "@/protocol/amount";
import { corridorFor } from "@/protocol/corridor";
import { isNetwork } from "@/protocol/networks";
import { agentSpendInWindow, type Agent } from "./agents";
import { sql } from "./db";
import { notFound } from "./errors";
import type { Payment } from "./payments";

// What an agent sees about itself and its requests. Shared by the REST API and the MCP server.

async function unitFor(agent: Agent) {
  const [row] = await sql<{ network: string }[]>`SELECT network FROM treasuries WHERE id = ${agent.treasuryId}`;
  if (!row || !isNetwork(row.network)) throw notFound("Account not found.");
  return { network: row.network, unit: corridorFor(row.network) };
}

export async function agentOverview(agent: Agent) {
  const { network, unit } = await unitFor(agent);
  const spent = await agentSpendInWindow(sql, agent.id, agent.policy.rollingCap.windowSeconds);
  const remaining = BigInt(agent.policy.rollingCap.amount) - spent;
  const fmt = (v: bigint | string) => formatAmount(BigInt(v), unit.decimals);
  return {
    agent: { id: agent.id, name: agent.name, mode: agent.mode, enabled: agent.enabled },
    network,
    currency: { symbol: unit.symbol, decimals: unit.decimals, recipient: unit.recipientLabel },
    mandate: { ...agent.policy, commitment: agent.policyCommitment },
    limits: {
      perPayment: fmt(agent.policy.perActionCap),
      perWindow: fmt(agent.policy.rollingCap.amount),
      windowHours: agent.policy.rollingCap.windowSeconds / 3600,
      allowedRecipients: agent.policy.counterparties,
      expiresAt: agent.policy.expiresAt,
    },
    budget: {
      committedInWindow: spent.toString(),
      remainingInWindow: (remaining > 0n ? remaining : 0n).toString(),
      remainingFormatted: fmt(remaining > 0n ? remaining : 0n),
      decimals: unit.decimals,
    },
  };
}

// Approvals carry signatures and account names, which an agent does not need.
export function agentView(payment: Payment) {
  const { approvals, ...visible } = payment;
  return { ...visible, approvalsCount: approvals.length };
}
