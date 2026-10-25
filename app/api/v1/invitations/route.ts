import { requireSession, route } from "@/server/http";
import { listInvitations } from "@/server/treasuries";

export const GET = route(async () => ({ invitations: await listInvitations(await requireSession()) }));
