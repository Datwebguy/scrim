import { reconnectPrivateBalance } from "@/server/auth";
import { overview } from "@/server/balances";
import { readJson, requireSession, route } from "@/server/http";

export const POST = route(async (request) => {
  const session = await requireSession();
  const body = await readJson(request);
  await reconnectPrivateBalance(session, {
    challengeId: String(body.challengeId ?? ""), accountId: String(body.accountId ?? ""),
    publicKey: String(body.publicKey ?? ""), signature: String(body.signature ?? ""),
  });
  return overview(session);
});
