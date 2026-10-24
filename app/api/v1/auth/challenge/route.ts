import { createSignInChallenge } from "@/server/auth";
import { readJson, route } from "@/server/http";

export const POST = route(async (request) => {
  const body = await readJson<{ accountId?: string }>(request);
  return createSignInChallenge(String(body.accountId ?? ""));
});
