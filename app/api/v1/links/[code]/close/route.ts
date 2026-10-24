import { requireSession, route } from "@/server/http";
import { closePayLink } from "@/server/paylinks";

export const POST = route<{ code: string }>(async (_r, { code }) => { await closePayLink(await requireSession(), code); return { ok: true }; });
