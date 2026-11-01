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

// Checks a transfer intent handed out by NEAR Intents before anyone is asked to sign it. It must be
// exactly one transfer: to the quote's one-time deposit address, of the quoted coin only (named publicly or
// as its private-balance token), for more than
// zero and no more than the quoted amount, expiring in time. Any other kind of intent (adding a key,
// withdrawing, swapping balances), a second intent, or a second coin is refused, so a wrong or hostile
// intent is never put in front of a wallet.
export function intentMatchesQuote(
  payload: { message: string; nonce: string },
  expect: { signerId: string; depositAddress: string; assetId: string; maxAmount: bigint; notAfter: Date },
): boolean {
  return intentMismatch(payload, expect) === null;
}

// The first rule a transfer intent breaks, by name only (never amounts or addresses), or null when it
// matches the quote. Used to refuse, and to say why in the server log.
export function intentMismatch(
  payload: { message: string; nonce: string },
  expect: { signerId: string; depositAddress: string; assetId: string; maxAmount: bigint; notAfter: Date },
): string | null {
  const parsed = parseIntentMessage(payload.message);
  if (!parsed) return "not an intent message";
  if (parsed.signer_id !== expect.signerId) return "signer";
  const deadline = Date.parse(parsed.deadline);
  if (!Number.isFinite(deadline) || deadline > expect.notAfter.getTime() + 5 * 60_000) return "deadline";
  if (Buffer.from(payload.nonce, "base64").length !== 32) return "nonce";
  if (parsed.intents.length !== 1) return "intent count";
  const intent = parsed.intents[0] as { intent?: unknown; receiver_id?: unknown; tokens?: unknown };
  if (intent?.intent !== "transfer") return "intent kind";
  if (intent.receiver_id !== expect.depositAddress) return "receiver";
  if (!intent.tokens || typeof intent.tokens !== "object" || Array.isArray(intent.tokens)) return "tokens shape";
  const tokens = Object.entries(intent.tokens as Record<string, unknown>);
  if (tokens.length !== 1) return "token count";
  const [token, amount] = tokens[0];
  if (!sameCoin(token, expect.assetId)) return "coin";
  if (typeof amount !== "string" || !/^\d+$/.test(amount)) return "amount format";
  const value = BigInt(amount);
  if (value <= 0n) return "amount zero";
  return value <= expect.maxAmount ? null : "amount above quote";
}

// Coins in a private balance live on NEAR Intents' private chain as IMT tokens: the public asset ID
// prefixed with NEAR Intents' private treasury, a fixed production account (see "Confidential Intents"
// in the NEAR Intents docs). A transfer of the quoted coin from a private balance names it that way.
export const PRIVATE_TREASURY = "51e8f94d77b5e90dc9852ca6113771e11e8382ce69473a75e313e41665de7cbe";
const sameCoin = (token: string, assetId: string) => token === assetId || token === `imt:${PRIVATE_TREASURY}:${assetId}`;

// An implicit NEAR account is the hex encoding of its ed25519 public key.
export function isImplicitAccount(accountId: string): boolean {
  return /^[0-9a-f]{64}$/.test(accountId);
}
