import { agentWallet, createAgentWallet, setAutonomous, setWalletPrivate } from "@/server/agent-wallets";
import { badRequest } from "@/server/errors";
import { requireSession, route } from "@/server/http";

// GET: the agent's own wallet (address, balances, links), or null. POST: create it (owner only).
// PATCH { autonomous?, private? }: let the agent pay by itself within its limits, or go back to asking;
// on mainnet, pay from its private balance or its public one.
export const GET = route<{ id: string }>(async (_request, { id }) => ({ wallet: await agentWallet(await requireSession(), id) }));
export const POST = route<{ id: string }>(async (_request, { id }) => ({ wallet: await createAgentWallet(await requireSession(), id) }));
export const PATCH = route<{ id: string }>(async (request, { id }) => {
  const body = (await request.json().catch(() => null)) as { autonomous?: unknown; private?: unknown } | null;
  const autonomous = body?.autonomous, privately = body?.private;
  if (typeof autonomous !== "boolean" && typeof privately !== "boolean") throw badRequest("Send { autonomous } or { private } as true or false.");
  const session = await requireSession();
  if (typeof privately === "boolean") await setWalletPrivate(session, id, privately);
  if (typeof autonomous === "boolean") await setAutonomous(session, id, autonomous);
  return { wallet: await agentWallet(session, id) };
});
