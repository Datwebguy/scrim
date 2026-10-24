import { NextResponse } from "next/server";
import { signIn, type SignedEnvelope } from "@/server/auth";
import { readJson, route, sessionCookie } from "@/server/http";

export const POST = route(async (request) => {
  const body = await readJson<Partial<SignedEnvelope>>(request);
  const { token, session } = await signIn({
    challengeId: String(body.challengeId ?? ""),
    accountId: String(body.accountId ?? ""),
    publicKey: String(body.publicKey ?? ""),
    signature: String(body.signature ?? ""),
  });
  const response = NextResponse.json({ accountId: session.accountId, network: session.network, expiresAt: session.expiresAt });
  response.cookies.set(sessionCookie(token));
  return response;
});
