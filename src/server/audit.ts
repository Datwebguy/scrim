import type { Tx } from "./db";

export type Actor = { type: "human" | "agent" | "system"; id: string };

export async function audit(tx: Tx, treasuryId: string | null, actor: Actor, action: string, subjectId: string | null, data: Record<string, unknown> = {}) {
  await tx`
    INSERT INTO audit_events (treasury_id, actor_type, actor_id, action, subject_id, data)
    VALUES (${treasuryId}, ${actor.type}, ${actor.id}, ${action}, ${subjectId}, ${tx.json(data as never)})`;
}
