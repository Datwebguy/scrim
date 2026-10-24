import { route } from "@/server/http";
import { proofState } from "@/server/proofs";

export const GET = route<{ id: string }>(async (_r, { id }) => proofState(id));
