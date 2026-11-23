import { disconnect } from "@/server/connectors";
import { requireSession, route } from "@/server/http";

export const POST = route<{ id: string }>(async (_request, { id }) => {
  await disconnect(await requireSession(), id);
  return { ok: true };
});
