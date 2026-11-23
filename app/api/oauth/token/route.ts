import type { NextRequest } from "next/server";
import { exchangeCode } from "@/server/connectors";
import { oauthRoute, preflight, readForm } from "@/server/oauth-http";

// The app swaps the one-time code from the person's approval for its own session token.
export const POST = oauthRoute(async (request: NextRequest) => exchangeCode(await readForm(request)));
export const OPTIONS = preflight;
