import { readJson, requireSession, route } from "@/server/http";
import { createPayLink, listPayLinks } from "@/server/paylinks";

export const GET = route(async () => ({ links: await listPayLinks(await requireSession()) }));

export const POST = route(async (request) => {
  const session = await requireSession();
  const b = await readJson(request);
  return { link: await createPayLink(session, { assetId: String(b.assetId ?? ""), amount: String(b.amount ?? ""), note: b.note ? String(b.note) : undefined, days: Number(b.days), receive: b.receive }) };
});
