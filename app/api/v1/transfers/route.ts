import { attachTransfer, getAiRequest } from "@/server/ai-requests";
import { badRequest } from "@/server/errors";
import { readJson, requireSession, route } from "@/server/http";
import { transferFromBody } from "@/server/transfer-input";
import { createTransfer, listTransfers } from "@/server/transfers";

export const GET = route(async () => ({ transfers: await listTransfers(await requireSession()) }));

export const POST = route(async (request) => {
  const session = await requireSession();
  const body = await readJson<Record<string, unknown>>(request);
  let input;
  try { input = transferFromBody(body); } catch (e) { throw badRequest((e as Error).message); }
  // A payment an AI app prepared: it must still be waiting, and the new transfer becomes its answer.
  const aiRequestId = typeof body.aiRequestId === "string" ? body.aiRequestId : null;
  if (aiRequestId && (await getAiRequest(session, aiRequestId)).state !== "waiting_for_you") throw badRequest("This request isn't waiting any more. Ask your AI app to prepare it again.");
  const transfer = await createTransfer(session, input);
  if (aiRequestId) await attachTransfer(session, aiRequestId, transfer.id);
  return { transfer };
});
