// Encryption at rest and Scrim's proof-signing key.
// Production must set SCRIM_SECRET_KEY and SCRIM_PROOF_KEY (32 random bytes each, base64).
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";

function keyFrom(name: string): Buffer {
  const raw = process.env[name];
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded.`);
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error(`${name} is not set.`);
  // Development only: a fixed, clearly-labelled key so local data survives restarts.
  return createHash("sha256").update(`scrim-development-only:${name}`).digest();
}

// A separate key for one purpose, derived from SCRIM_SECRET_KEY (never a fixed string in production).
export function derivedKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", keyFrom("SCRIM_SECRET_KEY"), Buffer.alloc(0), `scrim:${purpose}`, 32));
}

// AES-256-GCM. The associated data binds a ciphertext to the record it belongs to,
// so a value cannot be copied onto another row.
export function seal(value: unknown, associatedData: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom("SCRIM_SECRET_KEY"), iv);
  cipher.setAAD(Buffer.from(associatedData));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${body.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function open<T>(sealed: string, associatedData: string): T {
  const [version, iv, body, tag] = sealed.split(".");
  if (version !== "v1" || !iv || !body || !tag) throw new Error("Unknown sealed format.");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom("SCRIM_SECRET_KEY"), Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")) as T;
}

export function proofSigningKey(): { secret: Uint8Array; publicKey: Uint8Array } {
  const secret = new Uint8Array(keyFrom("SCRIM_PROOF_KEY"));
  return { secret, publicKey: ed25519.getPublicKey(secret) };
}
