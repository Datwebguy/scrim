import { requireSession, route } from "@/server/http";
import { revokeProof } from "@/server/proofs";

export const POST = route<{ id: string }>(async (_r, { id }) => { await revokeProof(await requireSession(), id); return { ok: true }; });
