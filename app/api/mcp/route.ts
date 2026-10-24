import { NextResponse, type NextRequest } from "next/server";
import { handleMcp } from "@/server/mcp";

const MAX_BODY_BYTES = 32 * 1024;
const headers = { "cache-control": "no-store" };

// MCP endpoint for AI agents. Authenticate with: Authorization: Bearer scrim_sk_…
export async function POST(request: NextRequest) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request is too large." } }, { status: 413, headers });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, { status: 400, headers });
  }
  const result = await handleMcp(body, request.headers.get("authorization"));
  if (result.status === 202) return new NextResponse(null, { status: 202, headers });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: result.status === 401 ? { ...headers, "www-authenticate": 'Bearer realm="scrim"' } : headers,
  });
}

// This server does not open server-to-client streams.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { ...headers, allow: "POST" } });
}
