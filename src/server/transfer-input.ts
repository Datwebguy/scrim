import type { TransferInput, TransferKind } from "./transfers";

const KINDS = new Set(["add", "swap", "send", "withdraw"]);

// Team payouts are created only by payTeamRequest, never from a request body.
export function transferFromBody(body: Record<string, unknown>): TransferInput {
  const kind = String(body.kind ?? "");
  if (!KINDS.has(kind)) throw new Error("Choose what you want to do.");
  const text = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));
  return {
    kind: kind as TransferKind,
    fromAssetId: text(body.fromAssetId),
    toAssetId: text(body.toAssetId),
    amount: String(body.amount ?? ""),
    recipient: text(body.recipient),
    note: text(body.note),
  };
}
