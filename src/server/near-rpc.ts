import { config } from "./config";

export type KeyVerifier = (accountId: string, publicKey: string) => Promise<boolean>;

// A signature only proves control of a key. The key must also be a current full-access key
// on the claimed account, read from chain at final finality.
export const verifyFullAccessKeyOnChain: KeyVerifier = async (accountId, publicKey) => {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "scrim",
      method: "query",
      params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`NEAR RPC responded ${response.status}`);
  const payload = (await response.json()) as { result?: { permission?: unknown }; error?: unknown };
  if (payload.error || !payload.result) return false;
  return payload.result.permission === "FullAccess";
};

let activeVerifier: KeyVerifier = verifyFullAccessKeyOnChain;

export function keyVerifier(): KeyVerifier {
  return activeVerifier;
}

// Test seam only. Production code never calls this.
export function setKeyVerifierForTests(verifier: KeyVerifier | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Key verifier cannot be replaced in production.");
  activeVerifier = verifier ?? verifyFullAccessKeyOnChain;
}
