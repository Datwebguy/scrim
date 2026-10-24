// NEP-413: off-chain message signing by a NEAR account key.
// https://github.com/near/NEPs/blob/master/neps/nep-0413.md
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import bs58 from "bs58";

const NEP413_TAG = 2 ** 31 + 413;

export type Nep413Payload = {
  message: string;
  nonce: Uint8Array; // exactly 32 bytes
  recipient: string;
  callbackUrl?: string | null;
};

function borshString(value: string): Uint8Array {
  const bytes = utf8ToBytes(value);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

export function serializeNep413(payload: Nep413Payload): Uint8Array {
  if (payload.nonce.length !== 32) throw new RangeError("NEP-413 nonce must be 32 bytes.");
  const tag = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, NEP413_TAG, true);
  const callback = payload.callbackUrl
    ? concat(Uint8Array.of(1), borshString(payload.callbackUrl))
    : Uint8Array.of(0);
  return concat(tag, borshString(payload.message), payload.nonce, borshString(payload.recipient), callback);
}

export function nep413Digest(payload: Nep413Payload): Uint8Array {
  return sha256(serializeNep413(payload));
}

export function parseEd25519PublicKey(key: string): Uint8Array {
  const [curve, data] = key.includes(":") ? key.split(":", 2) : ["ed25519", key];
  if (curve !== "ed25519") throw new Error("Only ed25519 keys are supported.");
  const bytes = bs58.decode(data);
  if (bytes.length !== 32) throw new Error("Malformed ed25519 public key.");
  return bytes;
}

// Wallets return base64 (per NEP-413) and some return "ed25519:<base58>".
export function decodeSignature(signature: string): Uint8Array {
  const bytes = signature.startsWith("ed25519:")
    ? bs58.decode(signature.slice(8))
    : Uint8Array.from(Buffer.from(signature, "base64"));
  if (bytes.length !== 64) throw new Error("Malformed ed25519 signature.");
  return bytes;
}

export function verifyNep413(payload: Nep413Payload, publicKey: string, signature: string): boolean {
  try {
    return ed25519.verify(decodeSignature(signature), nep413Digest(payload), parseEd25519PublicKey(publicKey));
  } catch {
    return false;
  }
}

export function encodePublicKey(bytes: Uint8Array): string {
  return `ed25519:${bs58.encode(bytes)}`;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
