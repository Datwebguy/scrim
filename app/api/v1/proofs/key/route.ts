import { route } from "@/server/http";
import { proofSigningKey } from "@/server/secrets";

// Public. A reader checks a proof's signature in their browser against this key.
export const GET = route(async () => ({ algorithm: "ed25519", publicKey: Buffer.from(proofSigningKey().publicKey).toString("base64url") }));
