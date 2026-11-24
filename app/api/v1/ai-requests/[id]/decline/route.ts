import { declineAiRequest } from "@/server/ai-requests";
import { requireSession, route } from "@/server/http";

export const POST = route<{ id: string }>(async (_request, { id }) => {
  await declineAiRequest(await requireSession(), id);
  return { ok: true };
});
