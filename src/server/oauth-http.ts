import { NextResponse, type NextRequest } from "next/server";
import { OAuthError } from "./connectors";
import { HttpError } from "./errors";
import { rateLimit } from "./rate-limit";

// Plain JSON answers for the OAuth endpoints AI apps call from anywhere. No cookies are read, so any origin may call.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "cache-control": "no-store",
};

export const origin = (request: NextRequest) => request.nextUrl.origin;

export function metadata(request: NextRequest) {
  const base = origin(request);
  return {
    issuer: base,
    authorization_endpoint: `${base}/app/connect`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["scrim"],
  };
}

export function protectedResource(request: NextRequest) {
  const base = origin(request);
  return { resource: `${base}/api/mcp`, authorization_servers: [base], bearer_methods_supported: ["header"], scopes_supported: ["scrim"], resource_name: "Scrim" };
}

export function oauthRoute(handler: (request: NextRequest) => Promise<unknown>, status = 200) {
  return async (request: NextRequest) => {
    try {
      await rateLimit(request.headers, request.nextUrl.pathname);
      return NextResponse.json(await handler(request), { status, headers: CORS });
    } catch (error) {
      if (error instanceof OAuthError) return NextResponse.json({ error: error.oauthCode, error_description: error.message }, { status: error.status, headers: CORS });
      if (error instanceof HttpError) return NextResponse.json({ error: error.status === 429 ? "slow_down" : "invalid_request", error_description: error.message }, { status: error.status, headers: CORS });
      console.error("[oauth]", error);
      return NextResponse.json({ error: "server_error", error_description: "Something went wrong. Try again." }, { status: 500, headers: CORS });
    }
  };
}

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

// Reads a form-encoded or JSON body, at most 8 KB.
export async function readForm(request: NextRequest): Promise<Record<string, string | undefined>> {
  const text = await request.text();
  if (text.length > 8 * 1024) throw new OAuthError("invalid_request", "Request is too large.");
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const v = JSON.parse(text);
      return typeof v === "object" && v && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === "string" ? x : undefined])) : {};
    } catch {
      throw new OAuthError("invalid_request", "Body must be JSON or a form.");
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}
