import { route } from "@/server/http";
import { deliver } from "@/server/products";
import { linkPaymentStatus } from "@/server/transfers";

// Public, by the payment's random ID. For a product, a completed payment also returns what was bought.
export const GET = route<{ code: string; transferId: string }>(async (_r, { code, transferId }) => {
  const payment = await linkPaymentStatus(code, transferId);
  return { payment, delivered: payment.status === "success" ? await deliver(code, transferId) : null };
});
