// Approval links from connected AI apps open Scrim's Send or Swap screen filled in. Scrim signs each link for the
// person's account, so the screen names the app only when Scrim made the link; anyone can still craft a filled-in
// link, and those get a plain warning instead of a trusted name.
import { createHmac, timingSafeEqual } from "node:crypto";
import { derivedKeys } from "./secrets";

const FIELDS = ["ai", "mode", "from", "to", "amount", "recipient", "note", "exp"] as const;
const TTL_MS = 24 * 60 * 60 * 1000;

function mac(key: Buffer, accountId: string, page: string, params: Record<string, string | undefined>) {
  const text = [accountId, page, ...FIELDS.map((f) => `${f}=${params[f] ?? ""}`)].join("\n");
  return createHmac("sha256", key).update(text).digest("base64url");
}

// Signs a link for one account and one screen. It expires after a day; the returned params include exp.
export function signApproval(accountId: string, page: "send" | "swap", params: Record<string, string | undefined>, now = Date.now()) {
  const all = { ...params, exp: String(now + TTL_MS) };
  return { ...all, sig: mac(derivedKeys("approval-link")[0], accountId, page, all) };
}

// The app name to show, only for a link Scrim signed for this account; null for any other link.
export function verifiedApp(accountId: string, page: "send" | "swap", params: Record<string, string | string[] | undefined>, now = Date.now()): string | null {
  const flat = Object.fromEntries(FIELDS.map((f) => [f, typeof params[f] === "string" ? (params[f] as string) : undefined]));
  const sig = typeof params.sig === "string" ? Buffer.from(params.sig) : null;
  if (!flat.ai || !sig || !(Number(flat.exp) > now)) return null;
  for (const key of derivedKeys("approval-link")) {
    const want = Buffer.from(mac(key, accountId, page, flat));
    if (want.length === sig.length && timingSafeEqual(want, sig)) return flat.ai.slice(0, 60);
  }
  return null;
}
