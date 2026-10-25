import { NextRequest } from "next/server";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http";
import { solanaContext } from "@/server/solana-rpc";

// What a Solana wallet needs to build a deposit: a recent blockhash and, for a token, which program owns it.
// A narrow window onto Scrim's own Solana connection, so the browser never needs one.
export const GET = route(async (request: NextRequest) => {
  const mint = request.nextUrl.searchParams.get("mint");
  if (mint !== null && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw badRequest("That token address doesn't look right.");
  return solanaContext(mint);
});
