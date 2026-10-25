// Messages that NEAR Intents accepts as proof of account ownership.
// A signed "empty intent" (no actions) authorises reading a private balance and nothing else.
import { randomBytes } from "node:crypto";

export const INTENTS_CONTRACT = "intents.near";
const NONCE_MAGIC = [0x56, 0x28, 0xf6, 0xc6];

// Versioned nonce: magic(4) | version(1) | salt(4) | deadline ns LE(8) | issued ns LE(8) | random(7)
export function versionedNonce(saltHex: string, deadline: Date, now = new Date(), random: Uint8Array = randomBytes(7)): Buffer {
  const salt = Buffer.from(saltHex, "hex");
  if (salt.length !== 4) throw new RangeError("Intents salt must be 4 bytes.");
  if (random.length !== 7) throw new RangeError("Random tail must be 7 bytes.");
  const nonce = Buffer.alloc(32);
  nonce.set(NONCE_MAGIC, 0);
  nonce[4] = 0;
  nonce.set(salt, 5);
  nonce.writeBigUInt64LE(BigInt(deadline.getTime()) * 1_000_000n, 9);
  nonce.writeBigUInt64LE(BigInt(now.getTime()) * 1_000_000n, 17);
  nonce.set(random, 25);
  return nonce;
}

export function ownershipMessage(accountId: string, deadline: Date): string {
  return JSON.stringify({ deadline: deadline.toISOString(), intents: [], signer_id: accountId });
}

export type IntentMessage = { deadline: string; intents: unknown[]; signer_id: string };

export function parseIntentMessage(message: string): IntentMessage | null {
  try {
    const value = JSON.parse(message) as IntentMessage;
    if (typeof value?.signer_id !== "string" || !Array.isArray(value.intents) || typeof value.deadline !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

// Checks a transfer intent handed out by NEAR Intents before anyone is asked to sign it. Whatever the
// exact shape, every receiver it names must be the quote's one-time deposit address, every token amount
// must be the quoted coin at no more than the quoted amount, and it must expire in time. Anything that
// contradicts the quote is refused, so a wrong or hostile intent is never put in front of a wallet.
export function intentMatchesQuote(
  payload: { message: string; nonce: string },
  expect: { signerId: string; depositAddress: string; assetId: string; maxAmount: bigint; notAfter: Date },
): boolean {
  const parsed = parseIntentMessage(payload.message);
  if (!parsed || parsed.signer_id !== expect.signerId) return false;
  const deadline = Date.parse(parsed.deadline);
  if (!Number.isFinite(deadline) || deadline > expect.notAfter.getTime() + 5 * 60_000) return false;
  if (Buffer.from(payload.nonce, "base64").length !== 32) return false;
  let ok = true;
  const walk = (value: unknown): void => {
    if (!ok || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(walk);
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "receiver_id" || key === "recipient" || key === "receiverId") && typeof v === "string" && v !== expect.depositAddress) ok = false;
      else if ((key === "tokens" || key === "diff") && v && typeof v === "object" && !Array.isArray(v)) {
        for (const [token, amount] of Object.entries(v as Record<string, unknown>)) {
          const n = typeof amount === "string" && /^-?\d+$/.test(amount) ? BigInt(amount) : null;
          if (token !== expect.assetId || n === null || (n < 0n ? -n : n) > expect.maxAmount) ok = false;
        }
      } else walk(v);
    }
  };
  walk(parsed.intents);
  return ok;
}

// An implicit NEAR account is the hex encoding of its ed25519 public key.
export function isImplicitAccount(accountId: string): boolean {
  return /^[0-9a-f]{64}$/.test(accountId);
}
