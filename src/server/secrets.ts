// Encryption at rest and Scrim's proof-signing key.
// Production must set SCRIM_SECRET_KEY and SCRIM_PROOF_KEY (32 random bytes each, base64).
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";

function keyFrom(name: string): Buffer {
  const raw = process.env[name];
  if (raw) return decodeKey(name, raw);
  if (process.env.NODE_ENV === "production") throw new Error(`${name} is not set.`);
  // Development only: a fixed, clearly-labelled key so local data survives restarts.
  return createHash("sha256").update(`scrim-development-only:${name}`).digest();
}

const KEY_BYTES = 32;

function decodeKey(name: string, raw: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_BYTES) throw new Error(`${name} must be 32 bytes, base64-encoded.`);
  return key;
}

// Keys that used to seal data. Kept only while a changeover is under way: set SCRIM_SECRET_KEY to the
// new key, list the old one(s) here (comma-separated), run `npm run rotate`, then remove them.
function previousKeys(): Buffer[] {
  return (process.env.SCRIM_SECRET_KEY_PREVIOUS ?? "").split(",").map((k) => k.trim()).filter(Boolean).map((k) => decodeKey("SCRIM_SECRET_KEY_PREVIOUS", k));
}

// A short fingerprint stored beside each sealed value, so the right key is found without trying them all.
// It is a hash of a random 32-byte key; it reveals nothing about the key.
const keyId = (key: Buffer) => createHash("sha256").update("scrim-key-id").update(key).digest("hex").slice(0, 8);

// A separate key for one purpose, derived from a secret key (never a fixed string in production).
function derive(secret: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), `scrim:${purpose}`, 32));
}
// The keys for one purpose: the current one first, then those still accepted while a changeover is under way.
export function derivedKeys(purpose: string): Buffer[] {
  return [keyFrom("SCRIM_SECRET_KEY"), ...previousKeys()].map((k) => derive(k, purpose));
}

// AES-256-GCM. The associated data binds a ciphertext to the record it belongs to,
// so a value cannot be copied onto another row.
export function seal(value: unknown, associatedData: string): string {
  const key = keyFrom("SCRIM_SECRET_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(associatedData));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v2.${keyId(key)}.${iv.toString("base64url")}.${body.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

function decrypt(key: Buffer, iv: string, body: string, tag: string, associatedData: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export function open<T>(sealed: string, associatedData: string): T {
  const parts = sealed.split(".");
  const candidates = [keyFrom("SCRIM_SECRET_KEY"), ...previousKeys()];
  if (parts[0] === "v2" && parts.length === 5) {
    const [, id, iv, body, tag] = parts;
    const key = candidates.find((k) => keyId(k) === id);
    if (!key) throw new Error("This value was sealed with a key that is no longer configured.");
    return JSON.parse(decrypt(key, iv, body, tag, associatedData)) as T;
  }
  if (parts[0] === "v1" && parts.length === 4) {
    const [, iv, body, tag] = parts;
    for (const key of candidates) {
      try {
        return JSON.parse(decrypt(key, iv, body, tag, associatedData)) as T;
      } catch {
        // Wrong key for this value: try the next one.
      }
    }
    throw new Error("This value could not be opened with the configured keys.");
  }
  throw new Error("Unknown sealed format.");
}

// True when a value was sealed with an older key or format, so it should be sealed again.
export function needsResealing(sealed: string): boolean {
  const parts = sealed.split(".");
  return !(parts[0] === "v2" && parts[1] === keyId(keyFrom("SCRIM_SECRET_KEY")));
}

export function proofSigningKey(): { secret: Uint8Array; publicKey: Uint8Array } {
  const secret = new Uint8Array(keyFrom("SCRIM_PROOF_KEY"));
  return { secret, publicKey: ed25519.getPublicKey(secret) };
}
