import { NextResponse } from "next/server";
import { isNetwork } from "@/protocol/networks";
import { signInWithEmailToken } from "@/server/email-accounts";
import { badRequest } from "@/server/errors";
import { readJson, route, sessionCookie } from "@/server/http";

export const POST = route(async (request) => {
  const body = await readJson<{ accessToken?: string; network?: string }>(request);
  if (!isNetwork(body.network)) throw badRequest("Choose testnet or mainnet.");
  const { token, session, privateStatus } = await signInWithEmailToken(String(body.accessToken ?? ""), body.network);
  const response = NextResponse.json({ accountId: session.accountId, network: session.network, expiresAt: session.expiresAt, privateStatus });
  response.cookies.set(sessionCookie(token));
  return response;
});
