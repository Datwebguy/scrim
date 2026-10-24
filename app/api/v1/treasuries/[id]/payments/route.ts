import { readJson, requireSession, route } from "@/server/http";
import { createHumanPayment } from "@/server/payments";

export const POST = route<{ id: string }>(async (request, { id }) => {
  const session = await requireSession();
  const body = await readJson(request);
  const payment = await createHumanPayment(session, id, {
    recipient: String(body.recipient ?? ""),
    amount: String(body.amount ?? ""),
    memo: String(body.memo ?? ""),
    idempotencyKey: request.headers.get("idempotency-key") ?? "",
  });
  return { payment };
});
