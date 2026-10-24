import { randomUUID } from "node:crypto";
import { normalizeNearAccount } from "@/protocol/identifiers";
import { audit } from "./audit";
import type { Session } from "./auth";
import { config } from "./config";
import { sql, type Tx } from "./db";
import { badRequest, forbidden, notFound } from "./errors";

export type Treasury = {
  id: string;
  name: string;
  kind: "individual" | "team";
  ownerAccountId: string;
  thresholdRequired: number;
  status: string;
  network: string;
  createdAt: Date;
  signers: { accountId: string; role: "owner" | "signer" }[];
};

export type TreasuryRole = "owner" | "signer";

type TreasuryRow = { id: string; name: string; kind: "individual" | "team"; owner_account_id: string; threshold_required: number; status: string; network: string; created_at: Date };

async function hydrate(tx: Tx, rows: TreasuryRow[]): Promise<Treasury[]> {
  if (rows.length === 0) return [];
  const signers = await tx<{ treasury_id: string; account_id: string; role: TreasuryRole }[]>`
    SELECT treasury_id, account_id, role FROM treasury_signers WHERE treasury_id IN ${tx(rows.map((r) => r.id))} ORDER BY role, added_at`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    ownerAccountId: r.owner_account_id,
    thresholdRequired: r.threshold_required,
    status: r.status,
    network: r.network,
    createdAt: r.created_at,
    signers: signers.filter((s) => s.treasury_id === r.id).map((s) => ({ accountId: s.account_id, role: s.role })),
  }));
}

export type CreateTreasuryInput = { name: string; kind: "individual" | "team"; signers: string[]; threshold?: number };

export async function createTreasury(session: Session, input: CreateTreasuryInput): Promise<Treasury> {
  const name = input.name.trim();
  if (!name || name.length > 80) throw badRequest("Name your treasury (up to 80 characters).");
  const others = new Set<string>();
  for (const raw of input.kind === "team" ? input.signers : []) {
    const id = normalizeNearAccount(raw);
    if (!id) throw badRequest(`"${raw}" is not a valid NEAR account ID.`);
    if (id !== session.accountId) others.add(id);
  }
  const total = others.size + 1;
  if (input.kind === "team" && total < 2) throw badRequest("A team treasury needs at least one other signer.");
  if (total > 20) throw badRequest("A treasury can have at most 20 signers.");
  const threshold = input.kind === "individual" ? 1 : (input.threshold ?? Math.min(2, total));
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > total) throw badRequest(`Approval threshold must be between 1 and ${total}.`);

  return sql.begin(async (tx) => {
    const id = randomUUID();
    const [row] = await tx<TreasuryRow[]>`
      INSERT INTO treasuries (id, name, kind, owner_account_id, threshold_required, network)
      VALUES (${id}, ${name}, ${input.kind}, ${session.accountId}, ${threshold}, ${config.network}) RETURNING *`;
    await tx`INSERT INTO treasury_signers (treasury_id, account_id, role) VALUES (${id}, ${session.accountId}, 'owner')`;
    for (const signer of others) await tx`INSERT INTO treasury_signers (treasury_id, account_id, role) VALUES (${id}, ${signer}, 'signer')`;
    await audit(tx, id, { type: "human", id: session.accountId }, "treasury.created", id, { kind: input.kind, threshold, signers: total });
    return (await hydrate(tx, [row]))[0];
  });
}

export async function listTreasuries(session: Session): Promise<Treasury[]> {
  const rows = await sql<TreasuryRow[]>`
    SELECT t.* FROM treasuries t JOIN treasury_signers s ON s.treasury_id = t.id
    WHERE s.account_id = ${session.accountId} AND t.network = ${config.network} ORDER BY t.created_at`;
  return hydrate(sql, rows);
}

// Loads a treasury only when the caller is one of its signers. Non-members get 404, not 403,
// so treasury IDs do not leak membership.
export async function treasuryForMember(tx: Tx, accountId: string, treasuryId: string): Promise<{ treasury: Treasury; role: TreasuryRole }> {
  if (!/^[0-9a-f-]{36}$/i.test(treasuryId)) throw notFound("Treasury not found.");
  const rows = await tx<TreasuryRow[]>`
    SELECT t.* FROM treasuries t JOIN treasury_signers s ON s.treasury_id = t.id
    WHERE t.id = ${treasuryId} AND s.account_id = ${accountId}`;
  if (!rows[0]) throw notFound("Treasury not found.");
  const [treasury] = await hydrate(tx, rows);
  return { treasury, role: treasury.signers.find((s) => s.accountId === accountId)!.role };
}

export function requireOwner(role: TreasuryRole) {
  if (role !== "owner") throw forbidden("Only the treasury owner can change agent mandates.");
}
