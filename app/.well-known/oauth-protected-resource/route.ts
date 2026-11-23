import type { NextRequest } from "next/server";
import { oauthRoute, preflight, protectedResource } from "@/server/oauth-http";

// Protected resource metadata (RFC 9728) for the MCP server at /api/mcp.
export const GET = oauthRoute(async (request: NextRequest) => protectedResource(request));
export const OPTIONS = preflight;
