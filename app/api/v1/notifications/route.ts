import { requireSession, route } from "@/server/http";
import { notices } from "@/server/notifications";

export const GET = route(async () => ({ notices: await notices(await requireSession()) }));
