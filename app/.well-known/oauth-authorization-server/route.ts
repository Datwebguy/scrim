import type { NextRequest } from "next/server";
import { metadata, oauthRoute, preflight } from "@/server/oauth-http";

// OAuth server metadata (RFC 8414), so AI apps find where to sign people in to Scrim.
export const GET = oauthRoute(async (request: NextRequest) => metadata(request));
export const OPTIONS = preflight;
