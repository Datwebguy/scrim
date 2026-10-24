import { overview } from "@/server/balances";
import { requireSession, route } from "@/server/http";

// Private balance status and holdings. Never cached; only the signed-in person can read it.
export const GET = route(async () => overview(await requireSession()));
