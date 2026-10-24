import type { Session } from "./auth";
import { sql } from "./db";
import { listTreasuries } from "./treasuries";

export type ShellTreasury = { id: string; name: string; kind: string; thresholdRequired: number; signerCount: number; pending: number };

// Sidebar data: treasuries plus the number of requests still waiting on this signer.
export async function shellTreasuries(session: Session): Promise<ShellTreasury[]> {
  const treasuries = await listTreasuries(session);
  if (treasuries.length === 0) return [];
  const pending = await sql<{ treasury_id: string; n: number }[]>`
    SELECT p.treasury_id, count(*)::int AS n FROM payment_requests p
    WHERE p.treasury_id IN ${sql(treasuries.map((t) => t.id))} AND p.status = 'awaiting_approval' AND p.expires_at > now()
      AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.request_id = p.id AND a.account_id = ${session.accountId})
    GROUP BY p.treasury_id`;
  return treasuries.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    thresholdRequired: t.thresholdRequired,
    signerCount: t.signers.length,
    pending: pending.find((p) => p.treasury_id === t.id)?.n ?? 0,
  }));
}
