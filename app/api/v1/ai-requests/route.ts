import { waitingAiRequests } from "@/server/ai-requests";
import { requireSession, route } from "@/server/http";

// Payments AI apps prepared that are waiting for this person.
export const GET = route(async () => ({ requests: await waitingAiRequests(await requireSession()) }));
