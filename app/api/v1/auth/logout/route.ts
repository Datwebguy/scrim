import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { revokeSession } from "@/server/auth";
import { config } from "@/server/config";
import { route, sessionCookie } from "@/server/http";

export const POST = route(async () => {
  const token = (await cookies()).get(config.sessionCookie)?.value;
  if (token) await revokeSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie("", 0));
  return response;
});
