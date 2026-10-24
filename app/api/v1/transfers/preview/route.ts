import { badRequest } from "@/server/errors";
import { readJson, requireSession, route } from "@/server/http";
import { transferFromBody } from "@/server/transfer-input";
import { preview } from "@/server/transfers";

export const POST = route(async (request) => {
  const session = await requireSession();
  let input;
  try { input = transferFromBody(await readJson(request)); } catch (e) { throw badRequest((e as Error).message); }
  return { preview: await preview(session, input) };
});
