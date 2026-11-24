// Approval links from connected AI apps open Scrim's Send or Swap screen filled in. Scrim signs each link for the
// person's account, so the screen names the app only when Scrim made the link; anyone can still craft a filled-in
// link, and those get a plain warning instead of a trusted name.
import { createHmac, timingSafeEqual } from "node:crypto";
import { derivedKeys } from "./secrets";

const FIELDS = ["ai", "mode", "from", "to", "amount", "recipient", "note"] as const;

function mac(key: Buffer, accountId: string, params: Record<string, string | undefined>) {
  const text = [accountId, ...FIELDS.map((f) => `${f}=${params[f] ?? ""}`)].join("\n");
  return createHmac("sha256", key).update(text).digest("base64url");
}

export function signApproval(accountId: string, params: Record<string, string | undefined>): string {
  return mac(derivedKeys("approval-link")[0], accountId, params);
}

// The app name to show, only for a link Scrim signed for this account; null for any other link.
export function verifiedApp(accountId: string, params: Record<string, string | string[] | undefined>): string | null {
  const flat = Object.fromEntries(FIELDS.map((f) => [f, typeof params[f] === "string" ? (params[f] as string) : undefined]));
  const sig = typeof params.sig === "string" ? Buffer.from(params.sig) : null;
  if (!flat.ai || !sig) return null;
  for (const key of derivedKeys("approval-link")) {
    const want = Buffer.from(mac(key, accountId, flat));
    if (want.length === sig.length && timingSafeEqual(want, sig)) return flat.ai.slice(0, 60);
  }
  return null;
}
