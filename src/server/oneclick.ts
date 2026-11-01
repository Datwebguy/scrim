// Client for the NEAR Intents 1Click API and the deposit bridge.
// Partner key (X-API-Key) identifies Scrim; a user session token unlocks one person's private balance.
import { config } from "./config";
import { HttpError } from "./errors";

export class UpstreamError extends HttpError {
  constructor(readonly upstreamStatus: number, message: string) {
    super(upstreamStatus >= 500 || upstreamStatus === 429 ? 503 : 502, "upstream", message);
  }
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; userToken?: string; partner?: boolean; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(path, config.oneClickUrl);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.partner && config.oneClickApiKey) headers["x-api-key"] = config.oneClickApiKey;
  if (init.userToken) headers.authorization = `Bearer ${init.userToken}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new UpstreamError(503, "The payment network is not responding. Try again in a moment.");
  }
  const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join("; ") : payload.message;
    throw new UpstreamError(response.status, friendly(message ?? `Request failed (${response.status}).`));
  }
  return payload as T;
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("amount is too low") || m.includes("too low")) return "That amount is below the minimum for this route. Try a larger amount.";
  if (m.includes("no quotes") || m.includes("failed to get quote")) return "No route is available for this pair right now. Try another asset or amount.";
  if (m.includes("insufficient")) return "Your private balance is too low for this.";
  return message;
}

export type TokenInfo = { assetId: string; decimals: number; blockchain: string; symbol: string; price: number; contractAddress?: string | null; coingeckoId?: string | null };

let tokenCache: { at: number; tokens: TokenInfo[] } | null = null;
export async function tokens(): Promise<TokenInfo[]> {
  if (tokenCache && Date.now() - tokenCache.at < 5 * 60_000) return tokenCache.tokens;
  const list = await call<TokenInfo[]>("/v0/tokens");
  tokenCache = { at: Date.now(), tokens: list };
  return list;
}

export type SessionTokens = { accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresIn: number };

export type SignedNep413 = {
  standard: "nep413";
  payload: { message: string; nonce: string; recipient: string };
  public_key: string;
  signature: string; // ed25519:<base58>
};

export const authenticate = (signedData: SignedNep413) => call<SessionTokens>("/v0/auth/authenticate", { body: { signedData } });

export const refresh = (refreshToken: string) => call<{ accessToken: string; expiresIn: number }>("/v0/auth/refresh", { body: { refreshToken } });

export const balances = (userToken: string) =>
  call<{ balances: { tokenId: string; available: string }[] }>("/v0/account/balances", { userToken });

type Venue = "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
export type QuoteRequest = {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: Venue;
  // Some chains (Stellar) take deposits only with a memo next to the address.
  depositMode?: "SIMPLE" | "MEMO";
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: Venue;
  recipient: string;
  recipientType: "DESTINATION_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
  deadline: string;
  quoteWaitingTimeMs?: number;
  referral?: string;
  // Basis points of the coin sent, paid to an account; NEAR Intents keeps half. 50 is 0.5%.
  appFees?: { recipient: string; fee: number }[];
};

export type QuoteResponse = {
  quote: {
    depositAddress?: string;
    depositMemo?: string;
    amountIn: string;
    amountInFormatted: string;
    amountInUsd?: string;
    minAmountIn?: string;
    amountOut: string;
    amountOutFormatted: string;
    amountOutUsd?: string;
    minAmountOut: string;
    deadline?: string;
    timeEstimate?: number;
  };
  quoteRequest: QuoteRequest;
  signature: string;
  timestamp: string;
};

export function quote(request: QuoteRequest, userToken?: string) {
  return call<QuoteResponse>("/v0/quote", { body: { referral: "scrim", ...request }, partner: true, userToken });
}

export function generateIntent(depositAddress: string, signerId: string) {
  return call<{ intent: { standard: "nep413"; payload: { message: string; nonce: string; recipient: string } } }>("/v0/generate-intent", {
    body: { type: "swap_transfer", standard: "nep413", depositAddress, signerId },
    partner: true,
  });
}

export function submitIntent(signedData: SignedNep413) {
  return call<{ intentHash: string }>("/v0/submit-intent", { body: { type: "swap_transfer", signedData }, partner: true });
}

type ExecutionStatus = "KNOWN_DEPOSIT_TX" | "PENDING_DEPOSIT" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED";

export type StatusResponse = {
  status: ExecutionStatus;
  updatedAt: string;
  quoteResponse?: { quoteRequest?: { recipient?: string; destinationAsset?: string; amount?: string } };
  swapDetails?: { amountIn?: string; amountOut?: string; originChainTxHashes?: { hash: string }[]; destinationChainTxHashes?: { hash: string; explorerUrl?: string }[]; refundReason?: string };
};

export function status(depositAddress: string, depositMemo?: string | null) {
  return call<StatusResponse>(
    "/v0/status",
    { partner: true, query: { depositAddress, ...(depositMemo ? { depositMemo } : {}) } },
  );
}

// Tells 1Click about a deposit so it is picked up sooner. Optional; status polling works without it.
export function submitDeposit(txHash: string, depositAddress: string, memo?: string | null) {
  return call<unknown>("/v0/deposit/submit", { body: { txHash, depositAddress, ...(memo ? { memo } : {}) }, partner: true });
}

// The bridge gives an address on an external chain that forwards deposits to a NEAR Intents account.
export async function bridgeDepositAddress(accountId: string, chain: string): Promise<{ address: string; memo?: string }> {
  for (const mode of ["SIMPLE", "MEMO"]) {
    let response: Response;
    try {
      response = await fetch(config.bridgeRpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "scrim", method: "deposit_address", params: [{ account_id: accountId, chain, deposit_mode: mode }] }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new UpstreamError(503, "The deposit network is not responding. Try again in a moment.");
    }
    const payload = (await response.json().catch(() => ({}))) as { result?: { address: string; memo?: string }; error?: unknown };
    if (payload.result?.address) return { address: payload.result.address, memo: payload.result.memo };
  }
  throw new UpstreamError(502, "Deposits on this network are not available right now.");
}
