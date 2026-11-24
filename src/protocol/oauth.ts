import { createHash } from "node:crypto";

// Small, pure checks for the OAuth flow AI apps use to connect to a person's Scrim account.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// An app may send people back only to an https address, or to its own machine while it runs locally.
export function isAllowedRedirect(uri: string): boolean {
  if (typeof uri !== "string" || uri.length > 500) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

// PKCE with S256: the app proves it is the one that started the approval.
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export function isChallenge(challenge: unknown): challenge is string {
  return typeof challenge === "string" && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

// Where the person is sent back, with the result in the query.
export function redirectWith(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  return url.toString();
}

// Known AI apps and where they send people back. A registered name that claims one of these but returns
// somewhere else is flagged on the consent screen. Apps on the person's own machine (Claude Code, Codex,
// Cursor, VS Code) return to localhost.
const KNOWN: [RegExp, string[]][] = [
  [/claude|anthropic/i, ["claude.ai", "claude.com", "anthropic.com"]],
  [/chat\s*gpt|openai|codex/i, ["chatgpt.com", "openai.com"]],
  [/cursor/i, ["cursor.com", "cursor.sh"]],
  [/grok|x\.ai|xai/i, ["x.ai", "grok.com"]],
  [/gemini|google/i, ["google.com", "gemini.google.com"]],
];

export function returnHost(uri: string): string {
  return new URL(uri).host;
}

// True when the name looks like a known app but the sign-in goes back somewhere that app doesn't use.
export function looksImpersonated(name: string, uri: string): boolean {
  const url = new URL(uri);
  if (LOOPBACK.has(url.hostname)) return false;
  const host = url.hostname.toLowerCase();
  return KNOWN.some(([pattern, hosts]) => pattern.test(name) && !hosts.some((h) => host === h || host.endsWith(`.${h}`)));
}
