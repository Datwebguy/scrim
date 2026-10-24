import { setAgentEnabled, updateMandate } from "@/server/agents";
import { badRequest } from "@/server/errors";
import { readJson, requireSession, route } from "@/server/http";
import { mandateFromBody } from "@/server/mandate-input";

// PATCH { enabled } pauses or resumes. PUT { mandate fields } publishes a new policy version.
export const PATCH = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = await readJson(request);
  if (typeof body.enabled !== "boolean") throw badRequest("Provide enabled: true or false.");
  return { agent: await setAgentEnabled(session, id, body.enabled) };
});

export const PUT = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  return { agent: await updateMandate(session, id, mandateFromBody(await readJson(request))) };
});
