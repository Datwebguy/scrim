import { randomBytes, randomUUID, createHash } from "node:crypto";
import bs58 from "bs58";
import { parseAmount } from "@/protocol/amount";
import { normalizeEvmAddress } from "@/protocol/identifiers";
import { policyCommitment, type MandatePolicy } from "@/protocol/policy";
import { audit } from "./audit";
import type { Session } from "./auth";
import { sql, type Tx } from "./db";
import { badRequest, notFound, unauthorized } from "./errors";
import { requireOwner, treasuryForMember } from "./treasuries";

export type Agent = {
  id: string;
  treasuryId: string;
  name: string;
  mode: "request_only" | "autonomous";
  enabled: boolean;
  keyPrefix: string;
  createdAt: Date;
  policy: MandatePolicy;
  policyCommitment: string;
};

export type MandateInput = {
  perActionCap: string; // decimal USDC
  rollingCap: string; // decimal USDC
  windowHours: number;
  counterparties: { address: string; label: string }[];
  expiresAt?: string | null;
};

const hashKey = (key: string) => createHash("sha256").update(key).digest();

function buildPolicy(input: MandateInput, version: number): MandatePolicy {
  let perAction: bigint, rolling: bigint;
  try {
    perAction = parseAmount(input.perActionCap);
    rolling = parseAmount(input.rollingCap);
  } catch (error) {
    throw badRequest((error as Error).message);
  }
  if (perAction <= 0n) throw badRequest("Per-action cap must be greater than zero.");
  if (rolling < perAction) throw badRequest("Rolling cap must be at least the per-action cap.");
  if (!Number.isInteger(input.windowHours) || input.windowHours < 1 || input.windowHours > 24 * 31) throw badRequest("Window must be between 1 hour and 31 days.");
  if (input.counterparties.length === 0) throw badRequest("Add at least one approved counterparty.");
  if (input.counterparties.length > 100) throw badRequest("At most 100 counterparties per mandate.");
  const seen = new Set<string>();
  const counterparties = input.counterparties.map(({ address, label }) => {
    const normalized = normalizeEvmAddress(address);
    if (!normalized) throw badRequest(`"${address}" is not a valid Base address.`);
    if (seen.has(normalized)) throw badRequest(`${address} is listed twice.`);
    seen.add(normalized);
    const name = (label ?? "").trim().slice(0, 60);
    return { address: normalized, label: name || `${normalized.slice(0, 6)}…${normalized.slice(-4)}` };
  });
  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const date = new Date(input.expiresAt);
    if (Number.isNaN(date.getTime()) || date <= new Date()) throw badRequest("Mandate expiry must be in the future.");
    expiresAt = date.toISOString();
  }
  return {
    version,
    perActionCap: perAction.toString(),
    rollingCap: { amount: rolling.toString(), windowSeconds: input.windowHours * 3600 },
    counterparties,
    expiresAt,
  };
}

type AgentRow = { id: string; treasury_id: string; name: string; mode: Agent["mode"]; enabled: boolean; key_prefix: string; created_at: Date; policy: MandatePolicy; commitment: string };

const toAgent = (r: AgentRow): Agent => ({
  id: r.id,
  treasuryId: r.treasury_id,
  name: r.name,
  mode: r.mode,
  enabled: r.enabled,
  keyPrefix: r.key_prefix,
  createdAt: r.created_at,
  policy: r.policy,
  policyCommitment: r.commitment,
});

const selectAgents = (tx: Tx) => tx`
  SELECT a.id, a.treasury_id, a.name, a.mode, a.enabled, a.key_prefix, a.created_at, p.policy, p.commitment
  FROM agents a JOIN agent_policies p ON p.agent_id = a.id AND p.version = a.policy_version`;

export async function createAgent(session: Session, treasuryId: string, input: { name: string } & MandateInput): Promise<{ agent: Agent; apiKey: string }> {
  const name = input.name.trim();
  if (!name || name.length > 60) throw badRequest("Name the agent (up to 60 characters).");
  const policy = buildPolicy(input, 1);
  return sql.begin(async (tx) => {
    const { role } = await treasuryForMember(tx, session.accountId, treasuryId);
    requireOwner(role);
    const id = randomUUID();
    const apiKey = `scrim_sk_${bs58.encode(randomBytes(32))}`;
    const commitment = policyCommitment(policy);
    await tx`
      INSERT INTO agents (id, treasury_id, name, policy_version, key_prefix, key_hash, created_by)
      VALUES (${id}, ${treasuryId}, ${name}, 1, ${apiKey.slice(0, 14)}, ${hashKey(apiKey)}, ${session.accountId})`;
    await tx`INSERT INTO agent_policies (agent_id, version, policy, commitment, created_by) VALUES (${id}, 1, ${tx.json(policy as never)}, ${commitment}, ${session.accountId})`;
    await audit(tx, treasuryId, { type: "human", id: session.accountId }, "agent.created", id, { name, policyVersion: 1, policyCommitment: commitment });
    const [row] = await tx<AgentRow[]>`${selectAgents(tx)} WHERE a.id = ${id}`;
    return { agent: toAgent(row), apiKey };
  });
}

export async function updateMandate(session: Session, agentId: string, input: MandateInput): Promise<Agent> {
  return sql.begin(async (tx) => {
    const [current] = await tx<{ treasury_id: string; policy_version: number }[]>`SELECT treasury_id, policy_version FROM agents WHERE id = ${agentId} FOR UPDATE`;
    if (!current) throw notFound("Agent not found.");
    const { role } = await treasuryForMember(tx, session.accountId, current.treasury_id);
    requireOwner(role);
    const version = current.policy_version + 1;
    const policy = buildPolicy(input, version);
    const commitment = policyCommitment(policy);
    await tx`INSERT INTO agent_policies (agent_id, version, policy, commitment, created_by) VALUES (${agentId}, ${version}, ${tx.json(policy as never)}, ${commitment}, ${session.accountId})`;
    await tx`UPDATE agents SET policy_version = ${version} WHERE id = ${agentId}`;
    await audit(tx, current.treasury_id, { type: "human", id: session.accountId }, "agent.mandate_updated", agentId, { policyVersion: version, policyCommitment: commitment });
    const [row] = await tx<AgentRow[]>`${selectAgents(tx)} WHERE a.id = ${agentId}`;
    return toAgent(row);
  });
}

// Any signer may pause an agent (a safety action). Only the owner may resume it.
export async function setAgentEnabled(session: Session, agentId: string, enabled: boolean): Promise<Agent> {
  return sql.begin(async (tx) => {
    const [current] = await tx<{ treasury_id: string }[]>`SELECT treasury_id FROM agents WHERE id = ${agentId} FOR UPDATE`;
    if (!current) throw notFound("Agent not found.");
    const { role } = await treasuryForMember(tx, session.accountId, current.treasury_id);
    if (enabled) requireOwner(role);
    await tx`UPDATE agents SET enabled = ${enabled}, paused_at = ${enabled ? null : new Date()} WHERE id = ${agentId}`;
    await audit(tx, current.treasury_id, { type: "human", id: session.accountId }, enabled ? "agent.resumed" : "agent.paused", agentId);
    const [row] = await tx<AgentRow[]>`${selectAgents(tx)} WHERE a.id = ${agentId}`;
    return toAgent(row);
  });
}

export async function listAgents(session: Session, treasuryId: string): Promise<Agent[]> {
  await treasuryForMember(sql, session.accountId, treasuryId);
  const rows = await sql<AgentRow[]>`${selectAgents(sql)} WHERE a.treasury_id = ${treasuryId} ORDER BY a.created_at`;
  return rows.map(toAgent);
}

export async function agentFromApiKey(authorization: string | null): Promise<Agent> {
  const key = authorization?.match(/^Bearer\s+(scrim_sk_[1-9A-HJ-NP-Za-km-z]+)$/)?.[1];
  if (!key) throw unauthorized("Provide an agent key as a Bearer token.");
  const [row] = await sql<AgentRow[]>`${selectAgents(sql)} WHERE a.key_hash = ${hashKey(key)}`;
  if (!row) throw unauthorized("Unknown agent key.");
  return toAgent(row);
}

export async function agentSpendInWindow(tx: Tx, agentId: string, windowSeconds: number): Promise<bigint> {
  const [row] = await tx<{ total: string | null }[]>`
    SELECT sum(amount)::text AS total FROM payment_requests
    WHERE agent_id = ${agentId}
      AND created_at > now() - make_interval(secs => ${windowSeconds})
      AND status NOT IN ('policy_rejected', 'cancelled', 'expired', 'failed')`;
  return BigInt(row?.total ?? "0");
}
