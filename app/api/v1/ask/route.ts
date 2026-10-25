import { ask } from "@/server/ask";
import { askAccount } from "@/server/ask-credits";
import { readJson, requireSession, route } from "@/server/http";

// GET: questions left (the free one, plus what the person's own credits pay for). POST { question }:
// a private answer about the signed-in person's own records, from NEAR AI Cloud.
export const GET = route(async () => askAccount(await requireSession()));
export const POST = route(async (request) => {
  const session = await requireSession();
  const body = (await readJson(request)) as { question?: unknown };
  return ask(session, String(body.question ?? ""));
});
