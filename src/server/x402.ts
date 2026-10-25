// x402 for payment links: an agent (or any HTTP client) pays a Scrim payment link with the
// `exact` scheme and the `near-intents` upfront method (x402-foundation/x402 PR #3370).
// Scrim is both the resource server and the facilitator. The money is delivered by NEAR Intents into
// the link owner's confidential balance, so the payer never learns where it went.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { catalog, checkAddress, type Asset } from "./assets";
import { sql } from "./db";
import { HttpError } from "./errors";
import * as oneclick from "./oneclick";
import { linkRow } from "./paylinks";
import { deliver, productInfo } from "./products";
import { createLinkPayment, linkPaymentStatus } from "./transfers";

const X402_VERSION = 2;
const MAX_TIMEOUT_SECONDS = 3600; // matches the link payment deposit window
const GRACE_SECONDS = 24 * 3600;
const KEY_ID = "s1";
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const OFFERED = ["USDC", "USDT"];

// The private destination: Scrim's own extension of `destination`, since the money goes into a
// confidential NEAR Intents balance rather than to a public address.
const DESTINATION_NETWORK = "near-intents:confidential";

type Entry = {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    assetTransferMethod: "near-intents";
    paymentFlow: "upfront";
    indicativeAmount?: string;
    destination: { network: string; asset: string; amount: string; recipient: string };
    refundDeadline?: string;
    operationToken?: string;
    depositMemo?: string;
  };
};

type PaymentRequired = { x402Version: number; resource: { url: string; description: string; mimeType: string }; accepts: Entry[]; error?: string };

type Payload = {
  x402Version?: number;
  resource?: { url?: string };
  accepted?: Partial<Entry>;
  payload?: { type?: string; refundTo?: string; slippageTolerance?: number; operationToken?: string; depositAddress?: string; depositMemo?: string; txHash?: string };
};

type Settlement = { success: boolean; errorReason?: string; network: string; transaction: string; payer?: string; amount?: string; extra?: Record<string, unknown> };

// ── Networks ──
function caip2(asset: Asset): string | null {
  const chain = asset.depositChain ?? "";
  if (chain.startsWith("eth:")) return `eip155:${chain.slice(4)}`;
  if (chain === "sol:mainnet") return SOLANA_MAINNET;
  return null;
}

function txHashOk(network: string, hash: string) {
  if (network.startsWith("eip155:")) return /^0x[0-9a-fA-F]{64}$/.test(hash);
  if (network === SOLANA_MAINNET) return /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash);
  return false;
}

type Origin = { entry: Entry; asset: Asset };

async function origins(link: Awaited<ReturnType<typeof linkRow>>): Promise<Origin[]> {
  const assets = await catalog();
  const tokens = new Map((await oneclick.tokens()).map((t) => [t.assetId, t]));
  const target = assets.find((a) => a.assetId === link.assetId);
  const destination = { network: DESTINATION_NETWORK, asset: link.assetId, amount: link.amount, recipient: `scrim:${link.id}` };
  const out: Origin[] = [];
  for (const asset of assets) {
    if (!OFFERED.includes(asset.symbol)) continue;
    const network = caip2(asset);
    const contract = tokens.get(asset.assetId)?.contractAddress;
    if (!network || !contract) continue;
    // Indicative only: the binding amount comes from the quote.
    const indicative =
      target?.priceUsd && asset.priceUsd
        ? ((BigInt(link.amount) * BigInt(Math.round(target.priceUsd * 1e6)) * 10n ** BigInt(asset.decimals) * 101n) /
            (100n * BigInt(Math.round(asset.priceUsd * 1e6)) * 10n ** BigInt(target.decimals))).toString()
        : undefined;
    out.push({
      asset,
      entry: {
        scheme: "exact", network, amount: "", asset: contract, payTo: "", maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        extra: { assetTransferMethod: "near-intents", paymentFlow: "upfront", ...(indicative ? { indicativeAmount: indicative } : {}), destination },
      },
    });
  }
  return out;
}

// ── Operation token: <keyId>.<expiry>.<mac>, no storage needed ──
function tokenKey() {
  return createHmac("sha256", process.env.SCRIM_SECRET_KEY ?? "scrim-development-only").update("x402-operation-token").digest();
}

function mac(network: string, depositAddress: string, memo: string | undefined, resource: string, destination: Entry["extra"]["destination"], expiry: number) {
  const destinationHash = createHash("sha256").update(`${destination.network}:${destination.asset}:${destination.amount}:${destination.recipient}`).digest("hex");
  const message = [network, depositAddress, ...(memo ? [memo] : []), resource, destinationHash, String(expiry)].join(":");
  return createHmac("sha256", tokenKey()).update(message).digest("base64url");
}

export function issueToken(network: string, depositAddress: string, memo: string | undefined, resource: string, destination: Entry["extra"]["destination"], refundDeadline: Date) {
  const expiry = Math.floor(refundDeadline.getTime() / 1000) + GRACE_SECONDS;
  return `${KEY_ID}.${expiry}.${mac(network, depositAddress, memo, resource, destination, expiry)}`;
}

export function checkToken(token: string, network: string, depositAddress: string, memo: string | undefined, resource: string, destination: Entry["extra"]["destination"]): "ok" | "expired" | "invalid" {
  const [keyId, expiryText, given] = token.split(".");
  const expiry = Number(expiryText);
  if (keyId !== KEY_ID || !Number.isInteger(expiry) || !given) return "invalid";
  if (expiry < Date.now() / 1000) return "expired";
  const expected = Buffer.from(mac(network, depositAddress, memo, resource, destination, expiry));
  const got = Buffer.from(given);
  return expected.length === got.length && timingSafeEqual(expected, got) ? "ok" : "invalid";
}

// ── Headers ──
export const encodeHeader = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
export function decodeHeader(value: string | null): Payload | null {
  if (!value || value.length > 16_000) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export type X402Result =
  | { kind: "required"; body: PaymentRequired }
  | { kind: "paid"; body: unknown; receipt: Settlement; raw?: { status: number; contentType: string; body: string } }
  | { kind: "failed"; status: number; body: PaymentRequired | { error: string }; receipt?: Settlement };

const LINK_DESCRIPTION = "Pay this Scrim payment link. The money arrives privately.";
// The resource description is carried with the resource URL, so concurrent requests never mix them.
const descriptions = new Map<string, string>();
function required(resource: string, accepts: Entry[], error?: string): PaymentRequired {
  return { x402Version: X402_VERSION, resource: { url: resource, description: descriptions.get(resource) ?? LINK_DESCRIPTION, mimeType: "application/json" }, accepts, ...(error ? { error } : {}) };
}

// A paid result: a product hands over what it sells; a plain link just confirms the payment.
async function paidResult(linkId: string, receipt: Settlement, fallback: unknown): Promise<X402Result> {
  const delivered = await deliver(linkId);
  return delivered ? { kind: "paid", receipt, body: null, raw: delivered } : { kind: "paid", receipt, body: fallback };
}

// The one entry point: what to answer for a request to a link's x402 address.
export async function handleX402(code: string, resource: string, header: string | null): Promise<X402Result> {
  const payment = decodeHeader(header);
  // A deposit for an operation quoted earlier is still settled (or answered) after the link is paid.
  const link = payment?.payload?.type === "deposit" ? await anyLink(code) : await linkRow(code);
  if (link.network !== "mainnet") throw new HttpError(404, "not_found", "This payment link doesn't exist.");
  const product = await productInfo(link.id);
  if (product) descriptions.set(resource, `${product.name}${product.description ? `: ${product.description}` : ""}. Paid privately through Scrim.`.slice(0, 400));
  else descriptions.delete(resource);
  const offers = await origins(link);
  if (offers.length === 0) throw new HttpError(503, "upstream", "No payment routes are available right now.");
  if (!payment) return { kind: "required", body: required(resource, offers.map((o) => o.entry)) };

  if (payment.resource?.url !== resource) return { kind: "failed", status: 400, body: required(resource, offers.map((o) => o.entry), "invalid_payload_resource") };
  const offer = offers.find((o) => o.entry.network === payment.accepted?.network && o.entry.asset.toLowerCase() === String(payment.accepted?.asset ?? "").toLowerCase());
  if (!offer || payment.accepted?.extra?.assetTransferMethod !== "near-intents") {
    return { kind: "failed", status: 400, body: required(resource, offers.map((o) => o.entry), "invalid_exact_near_intents_payload") };
  }
  const body = payment.payload ?? {};
  if (body.type === "quote") return quoteStep(link, resource, offers, offer, body);
  if (body.type === "deposit") return depositStep(link, resource, offer, body);
  return { kind: "failed", status: 400, body: required(resource, offers.map((o) => o.entry), "invalid_exact_near_intents_payload") };
}

async function quoteStep(link: Awaited<ReturnType<typeof linkRow>>, resource: string, offers: Origin[], offer: Origin, body: NonNullable<Payload["payload"]>): Promise<X402Result> {
  let refundTo: string;
  try {
    refundTo = checkAddress(offer.asset, String(body.refundTo ?? ""));
  } catch {
    return { kind: "failed", status: 400, body: required(resource, offers.map((o) => o.entry), "invalid_exact_near_intents_refund_address") };
  }
  let transfer;
  try {
    transfer = await createLinkPayment(link, { fromAssetId: offer.asset.assetId, refundAddress: refundTo });
  } catch {
    return { kind: "failed", status: 402, body: required(resource, offers.map((o) => o.entry), "invalid_exact_near_intents_quote_unavailable") };
  }
  const depositAddress = transfer.deposit!.address;
  const memo = transfer.deposit!.memo ?? undefined;
  const refundDeadline = new Date(transfer.expiresAt);
  const operationToken = issueToken(offer.entry.network, depositAddress, memo, resource, offer.entry.extra.destination, refundDeadline);
  await sql`INSERT INTO x402_operations (instrument, link_id, transfer_id, resource, network, asset)
    VALUES (${instrument(offer.entry.network, depositAddress, memo)}, ${link.id}, ${transfer.id}, ${resource}, ${offer.entry.network}, ${offer.entry.asset})
    ON CONFLICT (instrument) DO NOTHING`;
  const quoted: Entry = {
    ...offer.entry,
    amount: transfer.amountIn,
    payTo: depositAddress,
    extra: { ...offer.entry.extra, refundDeadline: refundDeadline.toISOString(), operationToken, ...(memo ? { depositMemo: memo } : {}) },
  };
  return { kind: "required", body: required(resource, [quoted, ...offers.filter((o) => o !== offer).map((o) => o.entry)]) };
}

const instrument = (network: string, address: string, memo?: string) => [network, address, ...(memo ? [memo] : [])].join(":");

async function depositStep(link: Awaited<ReturnType<typeof linkRow>>, resource: string, offer: Origin, body: NonNullable<Payload["payload"]>): Promise<X402Result> {
  const network = offer.entry.network;
  const fail = (status: number, errorReason: string, extra?: Record<string, unknown>): X402Result => {
    const receipt: Settlement = { success: false, errorReason, network, transaction: errorReason === "settlement_pending" ? String(body.txHash ?? "") : "", ...(extra ? { extra } : {}) };
    return { kind: "failed", status, body: { error: errorReason }, receipt };
  };
  const depositAddress = String(body.depositAddress ?? "");
  const memo = body.depositMemo ? String(body.depositMemo) : undefined;
  const txHash = String(body.txHash ?? "");
  if (!depositAddress || !txHashOk(network, txHash)) return fail(400, "invalid_exact_near_intents_payload");
  const check = checkToken(String(body.operationToken ?? ""), network, depositAddress, memo, resource, offer.entry.extra.destination);
  if (check === "expired") return fail(400, "invalid_exact_near_intents_token_expired");
  if (check === "invalid") return fail(400, "invalid_exact_near_intents_token_invalid");

  const key = instrument(network, depositAddress, memo);
  const [op] = await sql<{ link_id: string; transfer_id: string; result: Settlement | null; executed_at: Date | null }[]>`
    SELECT link_id, transfer_id, result, executed_at FROM x402_operations WHERE instrument = ${key}`;
  if (!op) return fail(400, "invalid_exact_near_intents_token_invalid");
  if (op.result) {
    // A product's buyer who lost the answer gets it again for the same paid deposit.
    if (op.result.success && op.executed_at && (await productInfo(op.link_id))) return paidResult(op.link_id, op.result, null);
    if (op.result.success && op.executed_at) return { kind: "failed", status: 409, body: { error: "exact_near_intents_operation_executed" }, receipt: op.result };
    if (!op.result.success) return { kind: "failed", status: 402, body: { error: op.result.errorReason ?? "exact_near_intents_payment_failed" }, receipt: op.result };
  }

  // Exactly one presentation works on an operation at a time; the claim expires on its own.
  const claimed = await sql`UPDATE x402_operations SET claimed_until = now() + interval '60 seconds'
    WHERE instrument = ${key} AND result IS NULL AND (claimed_until IS NULL OR claimed_until < now()) RETURNING instrument`;
  if (claimed.length === 0) return fail(402, "settlement_pending", { status: "PROCESSING" });
  const release = () => sql`UPDATE x402_operations SET claimed_until = NULL WHERE instrument = ${key} AND result IS NULL`;

  try {
    let status = await oneclick.status(depositAddress, memo);
    const request = status.quoteResponse?.quoteRequest;
    if (request && (request.recipient !== (await ownerOf(op.link_id)) || request.destinationAsset !== offer.entry.extra.destination.asset || request.amount !== offer.entry.extra.destination.amount)) {
      await release();
      return fail(400, "invalid_exact_near_intents_quote_mismatch");
    }
    await oneclick.submitDeposit(txHash, depositAddress, memo).catch(() => null);
    for (let i = 0; i < 6 && !["SUCCESS", "REFUNDED", "FAILED"].includes(status.status); i++) {
      await new Promise((r) => setTimeout(r, 2500));
      status = await oneclick.status(depositAddress, memo);
    }
    if (status.status === "SUCCESS") {
      const origin = status.swapDetails?.originChainTxHashes?.map((h) => h.hash.toLowerCase()) ?? [];
      if (!origin.includes(txHash.toLowerCase())) {
        await release();
        return fail(400, "invalid_exact_near_intents_deposit_not_found");
      }
      // The merchant is private, so the receipt names the payment, not where it was delivered.
      const receipt: Settlement = { success: true, network: DESTINATION_NETWORK, transaction: "", amount: offer.entry.extra.destination.amount, extra: { originNetwork: network, originTxHash: txHash } };
      const recorded = await sql`UPDATE x402_operations SET result = ${sql.json(receipt as never)}, executed_at = now(), claimed_until = NULL
        WHERE instrument = ${key} AND result IS NULL RETURNING instrument`;
      if (recorded.length === 0) return fail(409, "exact_near_intents_operation_executed");
      await linkPaymentStatus(op.link_id, op.transfer_id).catch(() => null); // marks the link paid
      return paidResult(link.id, receipt, { paid: true, link: link.id, amount: offer.entry.extra.destination.amount, asset: offer.entry.extra.destination.asset });
    }
    if (status.status === "REFUNDED" || status.status === "FAILED") {
      const partial = /partial|incomplete|insufficient/i.test(status.swapDetails?.refundReason ?? "");
      const receipt: Settlement = { success: false, errorReason: partial ? "exact_near_intents_insufficient_deposit" : "exact_near_intents_payment_failed", network, transaction: "", extra: { status: status.status } };
      await sql`UPDATE x402_operations SET result = ${sql.json(receipt as never)}, claimed_until = NULL WHERE instrument = ${key} AND result IS NULL`;
      return { kind: "failed", status: 402, body: { error: receipt.errorReason! }, receipt };
    }
    await release();
    return fail(402, "settlement_pending", { status: status.status });
  } catch (error) {
    await release();
    throw error;
  }
}

async function anyLink(code: string): Promise<Awaited<ReturnType<typeof linkRow>>> {
  const [row] = await sql<{ id: string; account_id: string; network: "mainnet" | "testnet"; asset_id: string; amount: string; expires_at: Date }[]>`
    SELECT id, account_id, network, asset_id, amount, expires_at FROM pay_links WHERE id = ${code}`;
  if (!row) throw new HttpError(404, "not_found", "This payment link doesn't exist.");
  return { id: row.id, accountId: row.account_id, network: row.network, assetId: row.asset_id, amount: row.amount, note: "", expiresAt: row.expires_at };
}

async function ownerOf(linkId: string) {
  const [row] = await sql<{ account_id: string }[]>`SELECT account_id FROM pay_links WHERE id = ${linkId}`;
  return row?.account_id;
}
