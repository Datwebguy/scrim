import { route } from "@/server/http";
import { linkPaymentStatus } from "@/server/transfers";

export const GET = route<{ code: string; transferId: string }>(async (_r, { code, transferId }) => ({ payment: await linkPaymentStatus(code, transferId) }));
