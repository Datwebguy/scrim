import { ed25519 } from "@noble/curves/ed25519.js";
import { encodePublicKey, nep413Digest } from "@/protocol/nep413";
import { sql } from "@/server/db";
import type { IssuedChallenge, SignedEnvelope } from "@/server/auth";
import { migrate } from "../scripts/migrate";

export async function resetDatabase() {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await migrate(() => {});
}

export type Wallet = { accountId: string; publicKey: string; sign(challenge: IssuedChallenge): SignedEnvelope };

// A local stand-in for a NEAR wallet: holds an ed25519 key and signs NEP-413 payloads.
export function wallet(accountId: string): Wallet {
  const secret = ed25519.utils.randomSecretKey();
  const publicKey = encodePublicKey(ed25519.getPublicKey(secret));
  return {
    accountId,
    publicKey,
    sign(challenge) {
      const digest = nep413Digest({ message: challenge.message, nonce: Buffer.from(challenge.nonce, "base64"), recipient: challenge.recipient });
      return { challengeId: challenge.challengeId, accountId, publicKey, signature: Buffer.from(ed25519.sign(digest, secret)).toString("base64") };
    },
  };
}
