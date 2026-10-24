import { listAgents } from "@/server/agents";
import { sql } from "@/server/db";
import { requireSession, route } from "@/server/http";
import { listAudit, listPayments } from "@/server/payments";
import { treasuryForMember } from "@/server/treasuries";

export const GET = route<{ id: string }>(async (_request, { id }) => {
  const session = await requireSession();
  const { treasury, role } = await treasuryForMember(sql, session.accountId, id);
  const [agents, payments, audit] = await Promise.all([listAgents(session, id), listPayments(session, id), listAudit(session, id)]);
  return { treasury, role, agents, payments, audit };
});
