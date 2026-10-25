import { ask } from "@/server/ask";
import { readJson, requireSession, route } from "@/server/http";

// POST { question }: a private answer about the signed-in person's own records, from NEAR AI Cloud.
export const POST = route(async (request) => {
  const session = await requireSession();
  const body = (await readJson(request)) as { question?: unknown };
  return ask(session, String(body.question ?? ""));
});
