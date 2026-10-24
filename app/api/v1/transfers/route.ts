import { badRequest } from "@/server/errors";
import { readJson, requireSession, route } from "@/server/http";
import { transferFromBody } from "@/server/transfer-input";
import { createTransfer, listTransfers } from "@/server/transfers";

export const GET = route(async () => ({ transfers: await listTransfers(await requireSession()) }));

export const POST = route(async (request) => {
  const session = await requireSession();
  let input;
  try { input = transferFromBody(await readJson(request)); } catch (e) { throw badRequest((e as Error).message); }
  return { transfer: await createTransfer(session, input) };
});
