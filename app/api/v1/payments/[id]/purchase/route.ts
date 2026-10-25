import { requireSession, route } from "@/server/http";
import { purchaseDetails } from "@/server/x402-client";

// GET: for an agent's x402 request, the seller, price, how it was paid and what the seller returned.
export const GET = route<{ id: string }>(async (_request, { id }) => ({ purchase: await purchaseDetails(await requireSession(), id) }));
