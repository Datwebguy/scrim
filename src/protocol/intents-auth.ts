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

// An implicit NEAR account is the hex encoding of its ed25519 public key.
export function isImplicitAccount(accountId: string): boolean {
  return /^[0-9a-f]{64}$/.test(accountId);
}
