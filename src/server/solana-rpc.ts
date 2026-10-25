import { HttpError } from "./errors";

const RPC = () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]); // the classic Token program: USDC, USDT and most coins

async function call<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { result?: T; error?: unknown } | null;
  if (!response?.ok || !body || body.error || body.result === undefined) throw new HttpError(502, "upstream", "Could not reach the Solana network. Try again in a moment.");
  return body.result;
}

export async function solanaContext(mint: string | null): Promise<{ blockhash: string; lastValidBlockHeight: string; tokenProgram: string | null }> {
  const [latest, account] = await Promise.all([
    call<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [{ commitment: "confirmed" }]),
    mint ? call<{ value: { owner: string } | null }>("getAccountInfo", [mint, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]) : Promise.resolve(null),
  ]);
  let tokenProgram: string | null = null;
  if (mint) {
    const owner = account?.value?.owner;
    if (!owner || !TOKEN_PROGRAMS.has(owner)) throw new HttpError(400, "unsupported_token", "That token can't be paid from a wallet here. Copy the address instead.");
    tokenProgram = owner;
  }
  return { blockhash: latest.value.blockhash, lastValidBlockHeight: String(latest.value.lastValidBlockHeight), tokenProgram };
}
