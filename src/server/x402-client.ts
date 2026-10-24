// Agents buying from x402 sellers, paid privately from the team's balance.
//
// 1. An agent asks to buy a URL. Scrim reads the seller's 402, picks a NEAR Intents (`near-intents`,
//    `upfront`) route, and files a team payment request named after the seller's web address. The
//    agent's limits apply as for any payment, and people approve it.
// 2. When the owner pays, Scrim asks the seller for a fresh quote (refunds go to the owner's own
//    deposit address, so they return to the private balance) and pays the quoted deposit address
//    with a private withdrawal that the owner's wallet signs.
// 3. Once delivered, Scrim presents the payment to the seller and keeps what it returns for the agent.
import { formatAmount } from "@/protocol/amount";
import { USDC_NEAR_TO_BASE } from "@/protocol/corridor";
import { normalizeOrigin } from "@/protocol/identifiers";
import type { Network } from "@/protocol/networks";
import type { Agent } from "./agents";
import { assetById, catalog, type Asset } from "./assets";
import type { Session } from "./auth";
import { sql } from "./db";
import { badRequest, conflict, HttpError, notFound } from "./errors";
import * as oneclick from "./oneclick";
import * as outlayer from "./outlayer";
import { createAgentPayment, type Payment } from "./payments";
import { safeRequest } from "./safe-fetch";
import { open, seal } from "./secrets";
import { createTransfer, type Transfer } from "./transfers";

const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const FEE_BUFFER = 1.03; // routes cost a little more than the seller's price; the limit covers it

type Entry = {
  scheme: string; network: string; amount: string; asset: string; payTo: string; maxTimeoutSeconds?: number;
  extra?: {
    assetTransferMethod?: string; paymentFlow?: string; indicativeAmount?: string;
    destination?: { network: string; asset: string; amount: string; recipient: string };
    refundDeadline?: string; operationToken?: string; depositMemo?: string;
  };
};
type PaymentRequired = { x402Version?: number; resource?: { url?: string }; accepts?: Entry[] };

export type Purchase = {
  url: string;
  status: "requested" | "stopped" | "paying" | "delivering" | "delivered" | "failed";
  network: string;
  error: string | null;
  response: { status: number; contentType: string | null; body: string; truncated: boolean } | null;
};

const decode = (value: string | undefined) => {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

function readRequired(res: { headers: Record<string, string>; body: string }): PaymentRequired | null {
  const fromHeader = decode(res.headers["payment-required"]);
  if (fromHeader?.accepts) return fromHeader;
  try {
    const body = JSON.parse(res.body);
    return body?.accepts ? body : null;
  } catch {
    return null;
  }
}

function originChainOf(network: string): string | null {
  if (network.startsWith("eip155:")) return `eth:${network.slice(7)}`;
  if (network === SOLANA_MAINNET) return "sol:mainnet";
  return null;
}

// Finds our catalog asset for an origin entry (network + token contract).
async function originAsset(entry: Entry): Promise<Asset | null> {
  const chain = originChainOf(entry.network);
  if (!chain) return null;
  const tokens = new Map((await oneclick.tokens()).map((t) => [t.assetId, t]));
  const assets = await catalog();
  return assets.find((a) => a.depositChain === chain && tokens.get(a.assetId)?.contractAddress?.toLowerCase() === entry.asset.toLowerCase()) ?? null;
}

// What the seller receives, in US dollars, so the agent's limits (kept in USDC) can apply.
async function destinationUsd(entry: Entry): Promise<number | null> {
  const d = entry.extra?.destination;
  if (!d) return null;
  let asset: Asset | null = null;
  if (d.network.startsWith("near-intents")) asset = await assetById(d.asset).catch(() => null);
  else {
    const chain = originChainOf(d.network);
    const tokens = new Map((await oneclick.tokens()).map((t) => [t.assetId, t]));
    asset = (await catalog()).find((a) => a.depositChain === chain && tokens.get(a.assetId)?.contractAddress?.toLowerCase() === d.asset.toLowerCase()) ?? null;
  }
  if (!asset?.priceUsd) return null;
  return (Number(d.amount) / 10 ** asset.decimals) * asset.priceUsd;
}

// The routes Scrim can pay: NEAR Intents upfront entries on EVM chains or Solana, with no memo.
// Prefers USDC (what team balances hold), then Base.
export async function chooseEntry(required: PaymentRequired): Promise<{ entry: Entry; asset: Asset } | null> {
  const candidates: { entry: Entry; asset: Asset }[] = [];
  for (const entry of required.accepts ?? []) {
    if (entry.scheme !== "exact" || entry.extra?.assetTransferMethod !== "near-intents" || entry.extra?.paymentFlow !== "upfront") continue;
    if (!entry.extra.destination?.amount) continue;
    const asset = await originAsset(entry);
    if (asset) candidates.push({ entry, asset });
  }
  const score = (c: { entry: Entry; asset: Asset }) => (c.asset.symbol === "USDC" ? 2 : 0) + (c.entry.network === "eip155:8453" ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

// ── 1. The agent asks ──
export async function requestPurchase(agent: Agent, url: string, idempotencyKey: string): Promise<{ payment: Payment; purchase: Purchase }> {
  const seller = normalizeOrigin(url);
  if (!seller) throw badRequest("Use the seller's full https:// address.");
  const [team] = await sql<{ network: string }[]>`SELECT network FROM treasuries WHERE id = ${agent.treasuryId}`;
  if (team?.network !== "mainnet") throw badRequest("x402 purchases are available on mainnet.");
  const res = await safeRequest(url, { timeoutMs: 10_000 });
  if (!res) throw badRequest("Couldn't reach that address.");
  if (res.status !== 402) throw badRequest(`That address didn't ask for payment (it answered ${res.status}).`);
  const required = readRequired(res);
  if (!required) throw badRequest("That address asked for payment, but not in the x402 format.");
  const choice = await chooseEntry(required);
  if (!choice) throw badRequest("That seller doesn't offer a payment route Scrim can use (NEAR Intents on an EVM chain or Solana).");
  const usd = await destinationUsd(choice.entry);
  if (usd === null) throw badRequest("Couldn't price what that seller asks for.");
  const amount = (Math.ceil(usd * FEE_BUFFER * 1e6) / 1e6).toFixed(6);

  const payment = await createAgentPayment(agent, { recipient: seller, amount, memo: `x402 ${url}`.slice(0, 140), idempotencyKey, x402: true });
  const status = payment.status === "policy_rejected" ? "stopped" : "requested";
  await sql`INSERT INTO x402_purchases (request_id, url, entry, status) VALUES (${payment.id}, ${url}, ${sql.json(choice.entry as never)}, ${status})
    ON CONFLICT (request_id) DO NOTHING`;
  return { payment, purchase: (await purchaseFor(payment.id))! };
}

type Row = { request_id: string; url: string; entry: Entry; status: Purchase["status"]; quote_sealed: string | null; result_sealed: string | null; error: string | null };
const aad = (requestId: string) => `x402:${requestId}`;

export async function purchaseFor(requestId: string): Promise<Purchase | null> {
  const [row] = await sql<Row[]>`SELECT * FROM x402_purchases WHERE request_id = ${requestId}`;
  if (!row) return null;
  return {
    url: row.url, status: row.status, network: row.entry.network, error: row.error,
    response: row.result_sealed ? open<Purchase["response"]>(row.result_sealed, aad(row.request_id)) : null,
  };
}

// ── 2. Paying ──
// Fresh terms from the seller on the route we priced, with refunds going to `refundTo(entry)`.
async function freshQuote(row: Row, approvedAmount: string, refundTo: (entry: Entry) => Promise<string>) {
  if (row.status !== "requested" && row.status !== "failed") throw conflict("This purchase is already being paid.");
  const first = await safeRequest(row.url, { timeoutMs: 10_000 });
  const required = first && first.status === 402 ? readRequired(first) : null;
  const entry = required?.accepts?.find((e) => e.network === row.entry.network && e.asset.toLowerCase() === row.entry.asset.toLowerCase() && e.extra?.assetTransferMethod === "near-intents");
  if (!entry) throw new HttpError(502, "upstream", "The seller no longer offers this payment route.");
  const asset = await originAsset(entry);
  if (!asset) throw new HttpError(502, "upstream", "The seller's payment route isn't supported.");

  const quotePayload = { x402Version: 2, resource: { url: required?.resource?.url ?? row.url }, accepted: entry, payload: { type: "quote", refundTo: await refundTo(entry) } };
  const second = await safeRequest(row.url, { timeoutMs: 20_000, headers: { "payment-signature": encode(quotePayload) } });
  const quotedList = second && second.status === 402 ? readRequired(second) : null;
  const quoted = quotedList?.accepts?.find((e) => e.network === entry.network && e.extra?.operationToken && e.payTo);
  if (!quoted?.extra?.operationToken || quoted.extra.depositMemo) throw new HttpError(502, "upstream", "The seller didn't return a payable quote.");

  // Never pay more than was approved (with the same small buffer).
  const quotedUsd = asset.priceUsd ? (Number(quoted.amount) / 10 ** asset.decimals) * asset.priceUsd : null;
  if (quotedUsd === null || quotedUsd > (Number(approvedAmount) / 1e6) * 1.02) throw conflict("The seller's price is now higher than what was approved.");

  await sql`UPDATE x402_purchases SET status = 'paying', error = NULL, updated_at = now(),
    quote_sealed = ${seal({ resource: quotePayload.resource, accepted: entry, quoted }, aad(row.request_id))} WHERE request_id = ${row.request_id}`;
  return { quoted, asset };
}

async function purchaseRow(requestId: string) {
  const [row] = await sql<Row[]>`SELECT * FROM x402_purchases WHERE request_id = ${requestId}`;
  if (!row) throw notFound("Purchase not found.");
  return row;
}

const unpay = (requestId: string) => sql`UPDATE x402_purchases SET status = 'requested', updated_at = now() WHERE request_id = ${requestId} AND status = 'paying'`;

// The owner pays: called instead of a normal payout when an approved request is an x402 purchase.
// Refunds go to the owner's own deposit address on that chain, which forwards into the private balance.
export async function payPurchase(session: Session, request: Payment): Promise<Transfer> {
  const row = await purchaseRow(request.id);
  const { quoted, asset } = await freshQuote(row, request.amount, async (entry) => (await oneclick.bridgeDepositAddress(session.accountId, originChainOf(entry.network)!)).address);
  try {
    return await createTransfer(session, {
      kind: "withdraw",
      fromAssetId: USDC_NEAR_TO_BASE.assetId,
      toAssetId: asset.assetId,
      amount: formatAmount(BigInt(quoted.amount), asset.decimals, 0),
      recipient: quoted.payTo,
      note: `x402 ${new URL(row.url).host}`,
      teamRequestId: request.id,
    });
  } catch (error) {
    await unpay(row.request_id);
    throw error;
  }
}

// OutLayer's names for the chains a seller may ask to be paid on.
function walletChainOf(network: string): string | null {
  const evm: Record<string, string> = { "eip155:1": "ethereum", "eip155:8453": "base", "eip155:42161": "arbitrum", "eip155:10": "optimism", "eip155:137": "polygon" };
  return evm[network] ?? (network === SOLANA_MAINNET ? "solana" : null);
}

// An agent that pays by itself: USDC from its own wallet's NEAR Intents balance to the quoted deposit
// address. Refunds go back to the agent's own address on that chain.
export async function payPurchaseFromWallet(requestId: string, network: Network, apiKey: string): Promise<outlayer.WalletRequest> {
  const row = await purchaseRow(requestId);
  const chain = walletChainOf(row.entry.network);
  if (!chain) throw badRequest("The agent's wallet can't pay on this seller's chain.");
  const [request] = await sql<{ amount: string }[]>`SELECT amount::text AS amount FROM payment_requests WHERE id = ${requestId}`;
  const { quoted, asset } = await freshQuote(row, request.amount, async () => (await outlayer.address(network, apiKey, chain === "solana" ? "solana" : "ethereum")).address);
  try {
    if (asset.symbol !== "USDC") throw badRequest("The agent's wallet pays sellers in USDC only.");
    return await outlayer.withdraw(network, apiKey, { to: quoted.payTo, amount: quoted.amount, token: `nep141:${outlayer.USDC[network]}`, chain }, `scrim-${requestId}`);
  } catch (error) {
    await unpay(requestId);
    throw error;
  }
}

// ── 3. Delivery ──
async function payoutHash(requestId: string): Promise<string | undefined> {
  const [transfer] = await sql<{ id: string; account_id: string; details_sealed: string }[]>`
    SELECT id, account_id, details_sealed FROM transfers WHERE team_request_id = ${requestId} AND status = 'success' ORDER BY created_at DESC LIMIT 1`;
  if (!transfer) return undefined;
  return open<{ resultHashes?: string[] }>(transfer.details_sealed, `transfer:${transfer.id}:${transfer.account_id}`).resultHashes?.[0];
}

// After the payout settles: present the payment to the seller and keep what it returns.
// Safe to call repeatedly; it only acts while the purchase is paying or delivering.
// `paidWith` is the deposit transaction when the agent's own wallet paid; otherwise it comes from the payout.
export async function deliverPurchase(requestId: string, paidWith?: string): Promise<Purchase | null> {
  const [row] = await sql<Row[]>`SELECT * FROM x402_purchases WHERE request_id = ${requestId}`;
  if (!row || !row.quote_sealed || (row.status !== "paying" && row.status !== "delivering")) return row ? purchaseFor(requestId) : null;
  const txHash = paidWith ?? (await payoutHash(requestId));
  if (!txHash) return purchaseFor(requestId);

  const q = open<{ resource: { url: string }; accepted: Entry; quoted: Entry }>(row.quote_sealed, aad(requestId));
  const deposit = { x402Version: 2, resource: q.resource, accepted: q.accepted, payload: { type: "deposit", operationToken: q.quoted.extra!.operationToken, depositAddress: q.quoted.payTo, txHash } };
  const res = await safeRequest(row.url, { timeoutMs: 45_000, maxBytes: 256 * 1024, headers: { "payment-signature": encode(deposit) } });
  const receipt = decode(res?.headers["payment-response"]);
  if (res && res.status >= 200 && res.status < 300) {
    const response = { status: res.status, contentType: res.headers["content-type"] ?? null, body: res.body, truncated: res.truncated };
    await sql`UPDATE x402_purchases SET status = 'delivered', result_sealed = ${seal(response, aad(requestId))}, error = NULL, updated_at = now() WHERE request_id = ${requestId}`;
  } else if (!res || receipt?.errorReason === "settlement_pending") {
    await sql`UPDATE x402_purchases SET status = 'delivering', updated_at = now() WHERE request_id = ${requestId}`;
  } else {
    const reason = String(receipt?.errorReason ?? `seller answered ${res.status}`).slice(0, 200);
    await sql`UPDATE x402_purchases SET status = 'failed', error = ${reason}, updated_at = now() WHERE request_id = ${requestId}`;
  }
  return purchaseFor(requestId);
}
