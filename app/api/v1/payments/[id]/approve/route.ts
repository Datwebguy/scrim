import { readJson, requireSession, route } from "@/server/http";
import { approvePayment } from "@/server/payments";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = await readJson(request);
  const payment = await approvePayment(session, id, {
    challengeId: String(body.challengeId ?? ""),
    accountId: String(body.accountId ?? ""),
    publicKey: String(body.publicKey ?? ""),
    signature: String(body.signature ?? ""),
  });
  return { payment };
});
