import { requireSession, route } from "@/server/http";
import { getTransfer } from "@/server/transfers";

export const GET = route<{ id: string }>(async (_r, { id }) => ({ transfer: await getTransfer(await requireSession(), id) }));
