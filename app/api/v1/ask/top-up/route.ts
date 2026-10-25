import { startTopUp } from "@/server/ask-credits";
import { readJson, requireSession, route } from "@/server/http";

// POST { dollars }: a private transfer from the person's balance to pay for more questions. Their wallet signs it.
export const POST = route(async (request) => {
  const body = (await readJson(request)) as { dollars?: unknown };
  return { transfer: await startTopUp(await requireSession(), Number(body.dollars)) };
});
