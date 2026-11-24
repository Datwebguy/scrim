import { markSent } from "@/server/ai-requests";
import { readJson, requireSession, route } from "@/server/http";

// The person paid this request straight from their NEAR wallet.
export const POST = route<{ id: string }>(async (request, { id }) => {
  const body = await readJson<{ txHash?: unknown }>(request);
  await markSent(await requireSession(), id, String(body.txHash ?? ""));
  return { ok: true };
});
