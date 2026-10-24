import { requireSession, route } from "@/server/http";
import { requestQuote } from "@/server/payments";

export const POST = route<{ id: string }>(async (_request, { id }) => ({ payment: await requestQuote(await requireSession(), id) }));
