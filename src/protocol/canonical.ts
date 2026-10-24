import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// Deterministic JSON: sorted keys, no whitespace. Used for every commitment Scrim produces.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cannot commit to a non-finite number.");
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value as object).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = normalize(item);
    }
    return out;
  }
  throw new TypeError(`Cannot commit to a ${typeof value}.`);
}

export function commitment(domain: string, value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(`scrim:${domain}:v1:${canonicalJson(value)}`)));
}
