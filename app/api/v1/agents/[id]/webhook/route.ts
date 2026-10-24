import { setAgentWebhook } from "@/server/agents";
import { readJson, requireSession, route } from "@/server/http";

// PUT { url }: set where Scrim sends updates for this agent (null removes it).
export const PUT = route<{ id: string }>(async (request, { id }) => {
  const body = await readJson(request);
  return setAgentWebhook(await requireSession(), id, body.url == null ? null : String(body.url));
});
