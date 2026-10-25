import { ask, askAllowance } from "@/server/ask";
import { readJson, requireSession, route } from "@/server/http";

// GET: how many questions are left today. POST { question }: a private answer about the signed-in
// person's own records, from NEAR AI Cloud.
export const GET = route(async () => askAllowance(await requireSession()));
export const POST = route(async (request) => {
  const session = await requireSession();
  const body = (await readJson(request)) as { question?: unknown };
  return ask(session, String(body.question ?? ""));
});
