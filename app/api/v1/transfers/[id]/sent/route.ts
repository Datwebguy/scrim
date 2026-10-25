import { readJson, requireSession, route } from "@/server/http";
import { depositSent } from "@/server/transfers";

// The wallet paid a from-wallet transfer: body { txHash }.
export const POST = route<{ id: string }>(async (request, { id }) => {
  const body = await readJson(request);
  return { transfer: await depositSent(await requireSession(), id, String(body.txHash ?? "")) };
});
