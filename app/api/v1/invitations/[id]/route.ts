import { readJson, requireSession, route } from "@/server/http";
import { answerInvitation } from "@/server/treasuries";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = await readJson<{ accept?: unknown }>(request);
  await answerInvitation(session, id, body.accept === true);
  return { ok: true };
});
