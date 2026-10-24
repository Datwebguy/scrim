// Outgoing HTTPS requests to addresses someone else gave us (webhooks, x402 sellers).
// Only public addresses are reached: the host is resolved once, refused if any answer is internal,
// and the connection goes to exactly that answer, so a name can't switch to an internal address
// between the check and the request (DNS rebinding). Redirects are never followed.
import { lookup as lookupCallback, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

// True for addresses that are not on the public internet.
export function isPrivateAddress(address: string): boolean {
  const host = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) === 6) return /^(::1?$|::$|fc|fd|fe[89ab]|ff|::ffff:|64:ff9b:|2001:db8:|2002:)/.test(host);
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0);
  }
  return false;
}

// A public https:// address with no credentials in it.
export function safePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  return !isPrivateAddress(host);
}

function publicOnlyLookup(hostname: string, options: object, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) {
  lookupCallback(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error("Address is not public."), { code: "EPRIVATE" }), "", 0);
    }
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export type SafeResponse = { status: number; headers: Record<string, string>; body: string; truncated: boolean };

// One request with a time limit and a size limit on the answer. Resolves null if the address isn't
// allowed or the request fails.
export function safeRequest(
  url: string,
  init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeResponse | null> {
  return new Promise((resolve) => {
    if (!safePublicUrl(url)) return resolve(null);
    const target = new URL(url);
    const maxBytes = init.maxBytes ?? 64 * 1024;
    const headers = { "user-agent": "Scrim/1", ...(init.headers ?? {}), ...(init.body !== undefined ? { "content-length": String(Buffer.byteLength(init.body)) } : {}) };
    const req = httpsRequest(target, { method: init.method ?? "GET", headers, lookup: publicOnlyLookup, timeout: init.timeoutMs ?? 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      res.on("data", (chunk: Buffer) => {
        if (size >= maxBytes) { truncated = true; return; }
        chunks.push(chunk.subarray(0, maxBytes - size));
        size += Math.min(chunk.length, maxBytes - size);
      });
      res.on("end", () => {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) flat[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
        resolve({ status: res.statusCode ?? 0, headers: flat, body: Buffer.concat(chunks).toString("utf8"), truncated });
      });
      res.on("error", () => resolve(null));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end(init.body);
  });
}
