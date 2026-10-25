import { randomBytes, randomUUID, createHash } from "node:crypto";
import bs58 from "bs58";
import { parseAmount } from "@/protocol/amount";
import { corridorFor, type Corridor } from "@/protocol/corridor";
import { normalizeEvmAddress, normalizeNearAccount, normalizeOrigin } from "@/protocol/identifiers";
import { policyCommitment, type MandatePolicy } from "@/protocol/policy";
import { audit } from "./audit";
import type { Session } from "./auth";
import { sql, type Tx } from "./db";
import { badRequest, notFound, unauthorized } from "./errors";
import { safePublicUrl } from "./safe-fetch";
import { seal } from "./secrets";
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
  webhookUrl: string | null;
  keyRotatedAt: Date | null;
  lastDelivery: { event: string; ok: boolean; statusCode: number | null; at: Date } | null;
};

export type MandateInput = {
  perActionCap: string; // decimal USDC
  rollingCap: string; // decimal USDC
  windowHours: number;
  counterparties: { address: string; label: string }[];
  expiresAt?: string | null;
};

const hashKey = (key: string) => createHash("sha256").update(key).digest();
const newApiKey = () => `scrim_sk_${bs58.encode(randomBytes(32))}`;

function buildPolicy(input: MandateInput, version: number, corridor: Corridor): MandatePolicy {
  let perAction: bigint, rolling: bigint;
  try {
    perAction = parseAmount(input.perActionCap, corridor.decimals);
    rolling = parseAmount(input.rollingCap, corridor.decimals);
  } catch (error) {
    throw badRequest((error as Error).message);
  }
  if (perAction <= 0n) throw badRequest("Per-action cap must be greater than zero.");
  if (rolling < perAction) throw badRequest("The limit per time window must be at least the limit per payment.");
  if (!Number.isInteger(input.windowHours) || input.windowHours < 1 || input.windowHours > 24 * 31) throw badRequest("Window must be between 1 hour and 31 days.");
  if (input.counterparties.length === 0) throw badRequest("Add at least one approved counterparty.");
  if (input.counterparties.length > 100) throw badRequest("At most 100 counterparties per mandate.");
  const seen = new Set<string>();
  const counterparties = input.counterparties.map(({ address, label }) => {
    // A recipient is an address on the team's network, or an x402 seller's web address.
    const normalized = (address.trim().startsWith("https://") ? normalizeOrigin(address) : null)
      ?? (corridor.recipient === "evm" ? normalizeEvmAddress(address) : normalizeNearAccount(address));
    if (!normalized) throw badRequest(`"${address}" is not ${corridor.recipientLabel} or an https:// seller address.`);
    if (seen.has(normalized)) throw badRequest(`${address} is listed twice.`);
    seen.add(normalized);
    const name = (label ?? "").trim().slice(0, 60);
    return { address: normalized, label: name || (normalized.length > 14 ? `${normalized.slice(0, 6)}…${normalized.slice(-4)}` : normalized) };
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

type AgentRow = {
  id: string; treasury_id: string; name: string; mode: Agent["mode"]; enabled: boolean; key_prefix: string; created_at: Date; policy: MandatePolicy; commitment: string;
  webhook_url: string | null; key_rotated_at: Date | null; d_event: string | null; d_ok: boolean | null; d_status: number | null; d_at: Date | null;
};

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
  webhookUrl: r.webhook_url,
  keyRotatedAt: r.key_rotated_at,
  lastDelivery: r.d_event ? { event: r.d_event, ok: Boolean(r.d_ok), statusCode: r.d_status, at: r.d_at! } : null,
});

const selectAgents = (tx: Tx) => tx`
  SELECT a.id, a.treasury_id, a.name, a.mode, a.enabled, a.key_prefix, a.created_at, p.policy, p.commitment, a.webhook_url, a.key_rotated_at,
         d.event AS d_event, d.ok AS d_ok, d.status_code AS d_status, d.created_at AS d_at
  FROM agents a JOIN agent_policies p ON p.agent_id = a.id AND p.version = a.policy_version
  LEFT JOIN LATERAL (SELECT event, ok, status_code, created_at FROM webhook_deliveries w WHERE w.agent_id = a.id ORDER BY w.id DESC LIMIT 1) d ON true`;

export async function createAgent(session: Session, treasuryId: string, input: { name: string } & MandateInput): Promise<{ agent: Agent; apiKey: string }> {
  const name = input.name.trim();
  if (!name || name.length > 60) throw badRequest("Name the agent (up to 60 characters).");
  return sql.begin(async (tx) => {
    const { role, treasury } = await treasuryForMember(tx, session.accountId, treasuryId, session.network);
    requireOwner(role);
    const policy = buildPolicy(input, 1, corridorFor(treasury.network));
    const id = randomUUID();
    const apiKey = newApiKey();
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
    const { role, treasury } = await treasuryForMember(tx, session.accountId, current.treasury_id, session.network);
    requireOwner(role);
    const version = current.policy_version + 1;
    const policy = buildPolicy(input, version, corridorFor(treasury.network));
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
    const { role } = await treasuryForMember(tx, session.accountId, current.treasury_id, session.network);
    if (enabled) requireOwner(role);
    await tx`UPDATE agents SET enabled = ${enabled}, paused_at = ${enabled ? null : new Date()} WHERE id = ${agentId}`;
    await audit(tx, current.treasury_id, { type: "human", id: session.accountId }, enabled ? "agent.resumed" : "agent.paused", agentId);
    const [row] = await tx<AgentRow[]>`${selectAgents(tx)} WHERE a.id = ${agentId}`;
    return toAgent(row);
  });
}

export async function listAgents(session: Session, treasuryId: string): Promise<Agent[]> {
  await treasuryForMember(sql, session.accountId, treasuryId, session.network);
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

// Issues a new key and stops the old one at once. Only the owner can do this.
export async function rotateAgentKey(session: Session, agentId: string): Promise<{ agent: Agent; apiKey: string }> {
  return sql.begin(async (tx) => {
    const [current] = await tx<{ treasury_id: string }[]>`SELECT treasury_id FROM agents WHERE id = ${agentId} FOR UPDATE`;
    if (!current) throw notFound("Agent not found.");
    const { role } = await treasuryForMember(tx, session.accountId, current.treasury_id, session.network);
    requireOwner(role);
    const apiKey = newApiKey();
    await tx`UPDATE agents SET key_prefix = ${apiKey.slice(0, 14)}, key_hash = ${hashKey(apiKey)}, key_rotated_at = now() WHERE id = ${agentId}`;
    await audit(tx, current.treasury_id, { type: "human", id: session.accountId }, "agent.key_rotated", agentId, { keyPrefix: apiKey.slice(0, 14) });
    const [row] = await tx<AgentRow[]>`${selectAgents(tx)} WHERE a.id = ${agentId}`;
    return { agent: toAgent(row), apiKey };
  });
}

// Sets (or clears, with null) the address Scrim calls when this agent's requests change.
// Returns a new signing secret, shown once, whenever a URL is set.
export async function setAgentWebhook(session: Session, agentId: string, url: string | null): Promise<{ agent: Agent; signingSecret: string | null }> {
  const clean = url?.trim() || null;
  if (clean && (clean.length > 500 || !safePublicUrl(clean))) throw badRequest("Use a public https:// address.");
  return sql.begin(async (tx) => {
    const [current] = await tx<{ treasury_id: string }[]>`SELECT treasury_id FROM agents WHERE id = ${agentId} FOR UPDATE`;
    if (!current) throw notFound("Agent not found.");
    const { role } = await treasuryForMember(tx, session.accountId, current.treasury_id, session.network);
    requireOwner(role);
    const signingSecret = clean ? `whsec_${bs58.encode(randomBytes(32))}` : null;
    await tx`UPDATE agents SET webhook_url = ${clean}, webhook_secret = ${signingSecret ? seal(signingSecret, `agent-webhook:${agentId}`) : null} WHERE id = ${agentId}`;
    await audit(tx, current.treasury_id, { type: "human", id: session.accountId }, clean ? "agent.webhook_set" : "agent.webhook_removed", agentId, clean ? { url: clean } : {});
    const [row] = await tx<AgentRow[]>`${selectAgents(tx)} WHERE a.id = ${agentId}`;
    return { agent: toAgent(row), signingSecret };
  });
}
