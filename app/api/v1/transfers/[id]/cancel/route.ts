import { requireSession, route } from "@/server/http";
import { cancelTransfer } from "@/server/transfers";

export const POST = route<{ id: string }>(async (_r, { id }) => ({ transfer: await cancelTransfer(await requireSession(), id) }));
