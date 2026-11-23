import { createPersonalKey } from "@/server/connectors";
import { readJson, requireSession, route } from "@/server/http";

// A personal key for an agent that can't sign people in. Shown once.
export const POST = route(async (request) => {
  const session = await requireSession();
  const body = await readJson<{ name?: unknown }>(request);
  return createPersonalKey(session, body.name);
});
