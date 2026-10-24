import { requireSession, route } from "@/server/http";
import { createApprovalChallenge } from "@/server/payments";

export const POST = route<{ id: string }>(async (_request, { id }) => createApprovalChallenge(await requireSession(), id));
