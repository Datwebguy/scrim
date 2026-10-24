import { readJson, requireSession, route } from "@/server/http";
import { createProof, listProofs, type ProofInput } from "@/server/proofs";

export const GET = route(async () => ({ proofs: await listProofs(await requireSession()) }));

export const POST = route(async (request) => {
  const session = await requireSession();
  const b = await readJson(request);
  const input: ProofInput = {
    kind: b.kind === "payment" ? "payment" : "balance_at_least",
    reader: String(b.reader ?? ""), days: Number(b.days), holder: b.holder ? String(b.holder) : undefined,
    unit: b.unit === "asset" ? "asset" : "usd", assetId: b.assetId ? String(b.assetId) : undefined,
    amount: b.amount ? String(b.amount) : undefined, transferId: b.transferId ? String(b.transferId) : undefined,
    revealExact: b.revealExact !== false,
  };
  return { proof: await createProof(session, input) };
});
