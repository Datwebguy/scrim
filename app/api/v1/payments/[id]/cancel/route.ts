import { requireSession, route } from "@/server/http";
import { cancelPayment } from "@/server/payments";

export const POST = route<{ id: string }>(async (_request, { id }) => ({ payment: await cancelPayment(await requireSession(), id) }));
