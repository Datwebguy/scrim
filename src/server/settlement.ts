// Settlement adapter for NEAR Intents (1Click). Phase A requests indicative quotes only;
// the adapter never holds keys and never submits deposits on a user's behalf.
import { commitment } from "@/protocol/canonical";
import { USDC_NEAR_TO_BASE } from "@/protocol/corridor";
import { config } from "./config";
import { HttpError } from "./errors";

const ONECLICK_URL = process.env.ONECLICK_URL || "https://1click.chaindefuser.com";

export type SettlementQuote = {
  provider: "near-intents-1click";
  confidentiality: "public" | "basic";
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  timeEstimateSeconds: number | null;
  deadline: Date;
  quoteCommitment: string;
  raw: unknown;
};

export type QuoteRequest = { requestId: string; amount: bigint; recipient: string; refundTo: string };

export type QuoteProvider = (input: QuoteRequest) => Promise<SettlementQuote>;

export const oneClickQuote: QuoteProvider = async (input) => {
  const confidential = Boolean(config.oneClickJwt);
  const deadline = new Date(Date.now() + 30 * 60_000);
  const body = {
    dry: true,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100,
    originAsset: USDC_NEAR_TO_BASE.source.assetId,
    destinationAsset: USDC_NEAR_TO_BASE.destination.assetId,
    amount: input.amount.toString(),
    depositType: "ORIGIN_CHAIN",
    refundTo: input.refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: input.recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: deadline.toISOString(),
    confidentiality: confidential ? "basic" : "public",
  };
  const response = await fetch(`${ONECLICK_URL}/v0/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(confidential ? { authorization: `Bearer ${config.oneClickJwt}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    quote?: { amountIn: string; amountOut: string; minAmountOut: string; timeEstimate?: number };
  };
  if (!response.ok || !payload.quote) {
    throw new HttpError(502, "quote_unavailable", `Settlement route did not return a quote${payload.message ? `: ${payload.message}` : "."}`);
  }
  const quote = payload.quote;
  return {
    provider: "near-intents-1click",
    confidentiality: confidential ? "basic" : "public",
    amountIn: BigInt(quote.amountIn),
    amountOut: BigInt(quote.amountOut),
    minAmountOut: BigInt(quote.minAmountOut),
    timeEstimateSeconds: quote.timeEstimate ?? null,
    deadline,
    quoteCommitment: commitment("settlement-quote", { requestId: input.requestId, request: body, quote }),
    raw: payload,
  };
};

let activeProvider: QuoteProvider = oneClickQuote;
export const quoteProvider = () => activeProvider;
export function setQuoteProviderForTests(provider: QuoteProvider | null) {
  if (process.env.NODE_ENV === "production") throw new Error("Quote provider cannot be replaced in production.");
  activeProvider = provider ?? oneClickQuote;
}

// 1Click refunds to a mainnet NEAR account. Testnet treasuries receive indicative quotes only.
export function refundAccountFor(ownerAccountId: string, network: string): string {
  return network === "mainnet" ? ownerAccountId : process.env.SCRIM_INDICATIVE_REFUND_ACCOUNT || "intents.near";
}
