import { listConnectors } from "@/server/connectors";
import { requireSession, route } from "@/server/http";

// AI apps and personal keys connected to this account.
export const GET = route(async () => ({ connectors: await listConnectors(await requireSession()) }));
