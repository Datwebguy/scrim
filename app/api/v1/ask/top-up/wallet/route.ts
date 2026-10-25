import { creditWalletTopUp } from "@/server/ask-credits";
import { readJson, requireSession, route } from "@/server/http";

// POST { txHash }: Ask credits paid straight from the wallet. Scrim reads the transfer from the chain and credits it once.
export const POST = route(async (request) => {
  const body = (await readJson(request)) as { txHash?: unknown };
  return { account: await creditWalletTopUp(await requireSession(), String(body.txHash ?? "")) };
});
