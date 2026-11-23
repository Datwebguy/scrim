import type { NextRequest } from "next/server";
import { OAuthError, registerClient } from "@/server/connectors";
import { oauthRoute, preflight } from "@/server/oauth-http";

// Dynamic client registration (RFC 7591): an AI app introduces itself before asking the person to connect.
export const POST = oauthRoute(async (request: NextRequest) => {
  const text = await request.text();
  if (text.length > 8 * 1024) throw new OAuthError("invalid_client_metadata", "Request is too large.");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new OAuthError("invalid_client_metadata", "Send JSON."); }
  if (typeof body !== "object" || !body || Array.isArray(body)) throw new OAuthError("invalid_client_metadata", "Send a JSON object.");
  return registerClient(body as Record<string, unknown>);
}, 201);
export const OPTIONS = preflight;
