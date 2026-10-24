import { requireSession, route } from "@/server/http";
import { getPayment } from "@/server/payments";

export const GET = route<{ id: string }>(async (_request, { id }) => ({ payment: await getPayment(await requireSession(), id) }));
