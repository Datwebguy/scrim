// Scrim proofs: a short statement about a private balance or payment, made for one named reader,
// signed by Scrim, valid until it expires. Anyone can check the signature in their browser.
//
// This is a signed statement, not a zero-knowledge proof: Scrim looked at the private balance and
// vouches for the claim. The format is versioned so proving can move onto the person's device later.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson } from "./canonical";

export const PROOF_PREFIX = "scrimproof1";

export type ProofClaim =
  | { type: "balance_at_least"; amount: string; symbol: string | null; unit: "asset" | "usd" }
  // `to`: who was paid (a NEAR account or an address on that chain). Proofs made before it was added have none.
  | { type: "payment"; amount: string; symbol: string; chainName: string; exact: boolean; paidAt: string; to?: string };

export type ProofPayload = {
  v: 1;
  id: string;
  reader: string;
  // `account`: the NEAR account Scrim verified as the sender. `holder` is only the name the sender typed.
  account?: string;
  holder: string | null;
  issuedAt: string;
  expiresAt: string;
  claim: ProofClaim;
};

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const digest = (body: string) => sha256(utf8ToBytes(`scrim:proof:v1:${body}`));

export function signProof(payload: ProofPayload, secret: Uint8Array): string {
  const body = b64u(utf8ToBytes(canonicalJson(payload)));
  return `${PROOF_PREFIX}.${body}.${b64u(ed25519.sign(digest(body), secret))}`;
}

export type ProofCheck =
  | { ok: true; payload: ProofPayload; expired: boolean; readerMatches: boolean | null }
  | { ok: false; reason: "format" | "version" | "signature" };

export function checkProof(token: string, publicKey: Uint8Array, options: { now?: Date; viewer?: string } = {}): ProofCheck {
  const [prefix, body, signature, extra] = token.trim().split(".");
  if (prefix !== PROOF_PREFIX || !body || !signature || extra !== undefined) return { ok: false, reason: prefix?.startsWith("scrimproof") ? "version" : "format" };
  try {
    if (!ed25519.verify(fromB64u(signature), digest(body), publicKey)) return { ok: false, reason: "signature" };
    const payload = JSON.parse(new TextDecoder().decode(fromB64u(body))) as ProofPayload;
    if (payload.v !== 1) return { ok: false, reason: "version" };
    const viewer = options.viewer?.trim().toLowerCase();
    return {
      ok: true,
      payload,
      expired: new Date(payload.expiresAt).getTime() <= (options.now ?? new Date()).getTime(),
      readerMatches: viewer ? viewer === payload.reader.trim().toLowerCase() : null,
    };
  } catch {
    return { ok: false, reason: "format" };
  }
}

export function describeClaim(claim: ProofClaim): string {
  if (claim.type === "balance_at_least") {
    return claim.unit === "usd" ? `holds at least $${claim.amount} in private funds` : `holds at least ${claim.amount} ${claim.symbol}`;
  }
  return `${claim.exact ? "sent exactly" : "sent at least"} ${claim.amount} ${claim.symbol} ${claim.to ? `to ${claim.to} on ${claim.chainName}` : `to ${claim.chainName}`}`;
}
