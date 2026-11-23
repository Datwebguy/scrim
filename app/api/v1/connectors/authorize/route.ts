import { approve } from "@/server/connectors";
import { readJson, requireSession, route } from "@/server/http";

// The person approved an AI app on /app/connect: make a one-time code and send them back to the app.
export const POST = route(async (request) => {
  const session = await requireSession();
  const body = await readJson<Record<string, unknown>>(request);
  const params = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  return approve(session, params, request.nextUrl.origin);
});
