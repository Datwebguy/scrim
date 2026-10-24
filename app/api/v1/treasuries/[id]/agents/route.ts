import { createAgent } from "@/server/agents";
import { readJson, requireSession, route } from "@/server/http";
import { mandateFromBody } from "@/server/mandate-input";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = await readJson(request);
  return createAgent(session, id, { name: String(body.name ?? ""), ...mandateFromBody(body) });
});
