import { isNetwork } from "@/protocol/networks";
import { createSignInChallenge } from "@/server/auth";
import { badRequest } from "@/server/errors";
import { readJson, route } from "@/server/http";

export const POST = route(async (request) => {
  const body = await readJson<{ accountId?: string; network?: string }>(request);
  if (!isNetwork(body.network)) throw badRequest("Choose testnet or mainnet.");
  return createSignInChallenge(String(body.accountId ?? ""), body.network);
});
