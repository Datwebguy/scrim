import { privateFundingAddress } from "@/server/agent-wallets";
import { readJson, requireSession, route } from "@/server/http";

// POST { chain, amount }: an address on that chain that funds the agent's private balance (mainnet).
export const POST = route<{ id: string }>(async (request, { id }) => {
  const body = (await readJson(request)) as { chain?: unknown; amount?: unknown };
  return { deposit: await privateFundingAddress(await requireSession(), id, String(body.chain ?? ""), String(body.amount ?? "")) };
});
