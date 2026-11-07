import { signForSession } from "@/server/email-accounts";
import { badRequest } from "@/server/errors";
import { readJson, requireSession, route } from "@/server/http";

// Signs a message for a person who signed in with an email. Needs their session and their live login token.
export const POST = route(async (request) => {
  const session = await requireSession();
  const body = await readJson<{ accessToken?: string; message?: string; nonce?: string; recipient?: string }>(request);
  const nonce = Uint8Array.from(Buffer.from(String(body.nonce ?? ""), "base64"));
  if (!body.message || !body.recipient || nonce.length !== 32) throw badRequest("Send the message, its recipient and its 32 byte nonce.");
  return signForSession(session, String(body.accessToken ?? ""), { message: body.message, nonce, recipient: body.recipient });
});
