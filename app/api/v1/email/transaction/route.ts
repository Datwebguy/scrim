import { sendForSession } from "@/server/email-accounts";
import { badRequest } from "@/server/errors";
import { readJson, requireSession, route } from "@/server/http";

// Sends from the public balance of a person who signed in with an email: a NEAR or token transfer, nothing else.
// Needs their session and their live login token.
export const POST = route(async (request) => {
  const session = await requireSession();
  const body = await readJson<{ accessToken?: string; receiverId?: string; actions?: unknown }>(request);
  if (!body.receiverId || !Array.isArray(body.actions)) throw badRequest("Send the recipient and the actions.");
  return sendForSession(session, String(body.accessToken ?? ""), { receiverId: body.receiverId, actions: body.actions });
});
