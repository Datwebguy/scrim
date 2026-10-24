import { requireSession, route } from "@/server/http";
import { payTeamRequest } from "@/server/transfers";

// The treasury owner pays an approved team request from their private balance.
export const POST = route<{ id: string }>(async (_r, { id }) => ({ transfer: await payTeamRequest(await requireSession(), id) }));
