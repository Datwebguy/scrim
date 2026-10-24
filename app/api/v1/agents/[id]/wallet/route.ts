import { agentWallet, createAgentWallet, setAutonomous } from "@/server/agent-wallets";
import { badRequest } from "@/server/errors";
import { requireSession, route } from "@/server/http";

// GET: the agent's own wallet (address, balances, links), or null. POST: create it (owner only).
// PATCH { autonomous }: let the agent pay by itself within its limits, or go back to asking.
export const GET = route<{ id: string }>(async (_request, { id }) => ({ wallet: await agentWallet(await requireSession(), id) }));
export const POST = route<{ id: string }>(async (_request, { id }) => ({ wallet: await createAgentWallet(await requireSession(), id) }));
export const PATCH = route<{ id: string }>(async (request, { id }) => {
  const body = (await request.json().catch(() => null)) as { autonomous?: unknown } | null;
  if (typeof body?.autonomous !== "boolean") throw badRequest("Send { autonomous: true | false }.");
  const session = await requireSession();
  await setAutonomous(session, id, body.autonomous);
  return { wallet: await agentWallet(session, id) };
});
