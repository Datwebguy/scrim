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
import { badRequest, conflict, forbidden, HttpError, notFound } from "./errors";
import * as oneclick from "./oneclick";
import * as outlayer from "./outlayer";
import { createAgentPayment, type Payment } from "./payments";
import { safeRequest } from "./safe-fetch";
import { open, seal } from "./secrets";
import { createTransfer, type Transfer } from "./transfers";
import { onChainBalance, ownAddress, payableByWallet, signPayment, SOLANA_MAINNET, walletAddresses, walletChain } from "./x402-wallet";

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
  status: "requested" | "stopped" | "funding" | "paying" | "delivering" | "delivered" | "failed";
  network: string;
  error: string | null;
  response: { status: number; contentType: string | null; body: string; truncated: boolean; charged?: string } | null; // charged: what an `upto` seller took
  route: "near-intents" | "wallet";
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

// Standard routes an agent wallet can sign, USDC only (agent limits are kept in USDC). For `upto`,
// the amount is the most the seller may charge. Prefers exact over upto, then Base.
async function chooseStandardEntry(required: PaymentRequired): Promise<{ entry: Entry; asset: Asset } | null> {
  const candidates: { entry: Entry; asset: Asset }[] = [];
  for (const entry of required.accepts ?? []) {
    if (!payableByWallet(entry)) continue;
    const asset = await originAsset(entry);
    if (asset?.symbol === "USDC") candidates.push({ entry, asset });
  }
  const score = (c: { entry: Entry }) => (c.entry.scheme === "exact" ? 2 : 0) + (c.entry.network === "eip155:8453" ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

// Finding paid services: searches the public x402 catalog (Coinbase's Bazaar) and says, for each result,
// what it costs and whether this agent can pay it, so the agent can pick one and call pay_x402.
export type PaidApi = { url: string; name: string | null; description: string; method: string; priceUsd: number | null; scheme: string | null; networks: string[]; payable: "private" | "wallet" | null; example: unknown };

export async function findPaidApis(query: string, limit = 10): Promise<PaidApi[]> {
  const q = query.trim().slice(0, 100);
  if (!q) throw badRequest("Say what you're looking for, like \"weather\" or \"company data\".");
  const res = await safeRequest(`https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?${new URLSearchParams({ query: q, limit: String(Math.min(Math.max(limit, 1), 20)) })}`, { timeoutMs: 15_000, maxBytes: 2 * 1024 * 1024 });
  if (!res || res.status !== 200) throw new HttpError(502, "upstream", "The x402 catalog isn't answering right now.");
  const items = (JSON.parse(res.body) as { resources?: { resource: string; serviceName?: string; description?: string; accepts?: Entry[]; extensions?: { bazaar?: { info?: { input?: { method?: string; queryParams?: unknown; body?: unknown } } } } }[] }).resources ?? [];
  return Promise.all(items.map(async (item) => {
    const input = item.extensions?.bazaar?.info?.input;
    const method = (input?.method ?? "GET").toUpperCase();
    const required = { accepts: item.accepts ?? [] };
    const privateRoute = await chooseEntry(required);
    const standard = privateRoute ? null : await chooseStandardEntry(required);
    const priced = standard ?? (privateRoute ? { entry: privateRoute.entry, asset: privateRoute.asset } : null);
    const priceUsd = standard?.asset.priceUsd ? (Number(standard.entry.amount) / 10 ** standard.asset.decimals) * standard.asset.priceUsd : privateRoute ? await destinationUsd(privateRoute.entry) : null;
    return {
      url: item.resource, name: item.serviceName ?? null, description: (item.description ?? "").slice(0, 300), method,
      priceUsd: priceUsd === null ? null : Math.round(priceUsd * 1e6) / 1e6, scheme: priced?.entry.scheme ?? null,
      networks: [...new Set((item.accepts ?? []).map((a) => a.network))],
      // Scrim buys with a GET to the address; services that need a POST body aren't payable yet.
      payable: method !== "GET" ? null : privateRoute ? "private" : standard ? "wallet" : null,
      example: input?.queryParams ?? null,
    };
  }));
}

// ── 1. The agent asks ──
export async function requestPurchase(agent: Agent, url: string, idempotencyKey: string): Promise<{ payment: Payment; purchase: Purchase }> {
  const seller = normalizeOrigin(url);
  if (!seller) throw badRequest("Use the seller's full https:// address.");
  const [team] = await sql<{ network: string }[]>`SELECT network FROM treasuries WHERE id = ${agent.treasuryId}`;
  if (team?.network !== "mainnet") throw badRequest("x402 purchases are available on mainnet.");
  // Nothing is fetched for an agent that couldn't pay this seller anyway.
  if (!agent.enabled) throw forbidden("This agent is paused by its owner.");
  if (agent.policy.expiresAt && new Date(agent.policy.expiresAt) <= new Date()) throw forbidden("This agent's limits have ended.");
  if (!agent.policy.counterparties.some((c) => c.address === seller)) throw forbidden(`${seller} isn't on this agent's allowed recipients. Ask its owner to add it.`);
  const res = await safeRequest(url, { timeoutMs: 10_000 });
  if (!res) throw badRequest("Couldn't reach that address.");
  if (res.status !== 402) throw badRequest(`That address didn't ask for payment (it answered ${res.status}).`);
  const required = readRequired(res);
  if (!required) throw badRequest("That address asked for payment, but not in the x402 format.");
  // Prefer the private NEAR Intents route; otherwise a standard route the agent's own wallet can sign.
  let route: "near-intents" | "wallet" = "near-intents";
  let chosen: Entry | null = null;
  let usd: number | null = null;
  const choice = await chooseEntry(required);
  if (choice) {
    chosen = choice.entry;
    usd = await destinationUsd(choice.entry);
  } else {
    const standard = await chooseStandardEntry(required);
    if (!standard) throw badRequest("That seller doesn't offer a payment route Scrim can use: NEAR Intents, or USDC on an EVM chain or Solana.");
    const [wallet] = await sql`SELECT 1 FROM agent_wallets WHERE agent_id = ${agent.id}`;
    if (!wallet || agent.mode !== "autonomous") throw badRequest("This seller takes standard x402 payments, which the agent pays from its own wallet. Give the agent a wallet and let it pay by itself.");
    route = "wallet";
    chosen = standard.entry;
    usd = standard.asset.priceUsd ? (Number(standard.entry.amount) / 10 ** standard.asset.decimals) * standard.asset.priceUsd : null;
  }
  if (usd === null) throw badRequest("Couldn't price what that seller asks for.");
  const amount = (Math.ceil(usd * FEE_BUFFER * 1e6) / 1e6).toFixed(6);

  const payment = await createAgentPayment(agent, { recipient: seller, amount, memo: `x402 ${url}`.slice(0, 140), idempotencyKey, x402: true });
  const status = payment.status === "policy_rejected" ? "stopped" : "requested";
  await sql`INSERT INTO x402_purchases (request_id, url, entry, status, route) VALUES (${payment.id}, ${url}, ${sql.json(chosen as never)}, ${status}, ${route})
    ON CONFLICT (request_id) DO NOTHING`;
  return { payment, purchase: (await purchaseFor(payment.id))! };
}

type Row = { request_id: string; url: string; entry: Entry; route: "near-intents" | "wallet"; funding_request_id: string | null; status: Purchase["status"]; quote_sealed: string | null; result_sealed: string | null; error: string | null; signed_at: Date | null };
const aad = (requestId: string) => `x402:${requestId}`;

export async function purchaseFor(requestId: string): Promise<Purchase | null> {
  const [row] = await sql<Row[]>`SELECT * FROM x402_purchases WHERE request_id = ${requestId}`;
  if (!row) return null;
  return {
    url: row.url, status: row.status, network: row.entry.network, error: row.error, route: row.route,
    response: row.result_sealed ? open<Purchase["response"]>(row.result_sealed, aad(row.request_id)) : null,
  };
}

// ── 2. Paying ──
// Fresh terms from the seller on the route we priced, with refunds going to `refundTo(entry)`.
async function freshQuote(row: Row, approvedAmount: string, refundTo: (entry: Entry) => Promise<string>) {
  // Left "paying" by a payout that expired (transfers last 15 minutes): open it to be paid again. Only
  // after 20 minutes, so a payer still setting up its transfer is never undercut.
  if (row.status === "paying" && !(await payoutOpen(row.request_id))) {
    await sql`UPDATE x402_purchases SET status = 'requested', updated_at = now()
      WHERE request_id = ${row.request_id} AND status = 'paying' AND updated_at < now() - interval '20 minutes'`;
    row = (await purchaseRow(row.request_id));
  }
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

  // Claim it: of two payers racing, only one gets here; the other changes nothing.
  const claimed = await sql`UPDATE x402_purchases SET status = 'paying', error = NULL, updated_at = now(),
    quote_sealed = ${seal({ resource: quotePayload.resource, accepted: entry, quoted }, aad(row.request_id))}
    WHERE request_id = ${row.request_id} AND status IN ('requested', 'failed') RETURNING request_id`;
  if (claimed.length !== 1) throw new HttpError(409, "conflict_claimed", "This purchase is already being paid.");
  return { quoted, asset };
}

// Claims the one signing step of a wallet purchase. Only one caller wins, only from the status it read,
// and never once a payment has been signed.
export async function claimForSigning(requestId: string, from: Purchase["status"]): Promise<boolean> {
  const claimed = await sql`UPDATE x402_purchases SET status = 'paying', error = NULL, updated_at = now()
    WHERE request_id = ${requestId} AND status = ${from} AND status IN ('requested', 'funding') AND signed_at IS NULL RETURNING request_id`;
  return claimed.length === 1;
}

// Whether a payout for this purchase may still be paying (a transfer in flight, or the agent's wallet sending it).
async function payoutOpen(requestId: string): Promise<boolean> {
  const open = await sql`
    SELECT 1 FROM transfers WHERE team_request_id = ${requestId}
      AND (status IN ('processing', 'success') OR (status IN ('awaiting_signature', 'awaiting_deposit') AND expires_at > now()))
    UNION ALL SELECT 1 FROM agent_payouts WHERE request_id = ${requestId}`;
  return open.length > 0;
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
  if (row.route === "wallet") throw badRequest("This seller is paid from the agent's own wallet, not the account balance.");
  const { quoted, asset } = await freshQuote(row, request.amount, async (entry) => (await oneclick.bridgeDepositAddress(session.accountId, originChainOf(entry.network)!)).address);
  // From here this call holds the claim, so undoing it on failure is safe.
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

// An agent that pays by itself: USDC from its own wallet (private balance by default) to the quoted
// deposit address. Refunds go back to the agent's own address on that chain.
export async function payPurchaseFromWallet(requestId: string, network: Network, apiKey: string, fromPrivate: boolean): Promise<outlayer.WalletRequest> {
  const row = await purchaseRow(requestId);
  const chain = walletChainOf(row.entry.network);
  if (!chain) throw badRequest("The agent's wallet can't pay on this seller's chain.");
  const [request] = await sql<{ amount: string }[]>`SELECT amount::text AS amount FROM payment_requests WHERE id = ${requestId}`;
  const { quoted, asset } = await freshQuote(row, request.amount, async () => (await outlayer.address(network, apiKey, chain === "solana" ? "solana" : "ethereum")).address);
  try {
    if (asset.symbol !== "USDC") throw badRequest("The agent's wallet pays sellers in USDC only.");
    return await (fromPrivate ? outlayer.privateWithdraw : outlayer.withdraw)(network, apiKey, { to: quoted.payTo, amount: quoted.amount, token: `nep141:${outlayer.USDC[network]}`, chain }, `scrim-${requestId}`);
  } catch (error) {
    await unpay(requestId);
    throw error;
  }
}

// An agent wallet paying a standard x402 seller. Resumable: each call moves the purchase one step on
// (top up the wallet's address on the seller's chain if short, then sign, pay and collect) and says
// whether it is done. A signed payment is sent once; if its outcome is unknown it is not signed again.
export type WalletStep = { state: "pending" } | { state: "paid"; txHash: string | null };

const minor = (amount: bigint, from: number, to: number) => (to >= from ? amount * 10n ** BigInt(to - from) : (amount + 10n ** BigInt(from - to) - 1n) / 10n ** BigInt(from - to));

export async function advanceWalletPurchase(requestId: string, network: Network, apiKey: string, fromPrivate: boolean): Promise<WalletStep> {
  const row = await purchaseRow(requestId);
  if (row.route !== "wallet") throw badRequest("This purchase isn't paid from the agent's wallet.");
  if (row.status === "delivered") return { state: "paid", txHash: null };
  if (row.status === "paying" || row.status === "delivering" || row.status === "stopped") return { state: "pending" };
  // A purchase is signed at most once. Once signed, the seller may have taken the money, so it is never signed again.
  if (row.signed_at) return row.status === "failed" ? Promise.reject(new HttpError(502, "upstream", row.error ?? "The seller didn't accept the payment.")) : { state: "pending" };
  if (row.status === "failed") throw new HttpError(502, "upstream", row.error ?? "This purchase didn't go through.");
  const entry = row.entry;
  const chain = walletChain(entry.network);
  const asset = await originAsset(entry);
  const addrs = await walletAddresses(network, apiKey);
  const target = ownAddress(entry as never, addrs);
  if (!chain || !asset || !target) throw new HttpError(502, "upstream", "The agent's wallet can't pay on this seller's chain.");
  const fail = async (reason: string) => {
    await sql`UPDATE x402_purchases SET status = 'failed', error = ${reason.slice(0, 200)}, updated_at = now() WHERE request_id = ${requestId}`;
    throw new HttpError(502, "upstream", reason);
  };

  if (row.status === "funding" && row.funding_request_id) {
    const topUp = await outlayer.request(network, apiKey, row.funding_request_id).catch(() => null);
    if (!topUp || ["processing", "pending_approval", "pending_deposit"].includes(topUp.status)) return { state: "pending" };
    if (topUp.status !== "success") return fail(topUp.result?.reason ?? "Topping up the agent's wallet didn't go through.");
  }
  const need = BigInt(entry.amount);
  const have = await onChainBalance(entry as never, addrs);
  if (have < need) {
    if (row.status === "funding") return { state: "pending" }; // landed, waiting for the chain to show it
    // Top up with USDC from the wallet's NEAR Intents balance (private by default), plus room for the
    // bridge fee. Anything left over stays on the wallet's own address for the next purchase.
    const short = minor(need - have, asset.decimals, 6);
    const amount = (short + short / 20n + 100_000n > 1_000_000n ? short + short / 20n + 100_000n : 1_000_000n).toString();
    const send = fromPrivate ? outlayer.privateWithdraw : outlayer.withdraw;
    const sent = await send(network, apiKey, { to: target, amount, token: `nep141:${outlayer.USDC[network]}`, chain }, `scrim-fund-${requestId}`);
    if (sent.status === "failed") return fail(sent.result?.reason ?? sent.error ?? "Topping up the agent's wallet didn't go through.");
    await sql`UPDATE x402_purchases SET status = 'funding', funding_request_id = ${sent.request_id ?? null}, error = NULL, updated_at = now() WHERE request_id = ${requestId}`;
    return { state: "pending" };
  }

  // Claim the payment step: one signature per purchase.
  if (!(await claimForSigning(requestId, row.status))) return { state: "pending" };
  const first = await safeRequest(row.url, { timeoutMs: 10_000 });
  const required = first && first.status === 402 ? readRequired(first) : null;
  const fresh = required?.accepts?.find((e) => e.scheme === entry.scheme && e.network === entry.network && e.asset.toLowerCase() === entry.asset.toLowerCase()
    && e.payTo === entry.payTo && /^\d+$/.test(e.amount) && BigInt(e.amount) <= need && payableByWallet(e as never));
  if (!required || !fresh) return fail("The seller no longer offers this payment route at the approved price.");
  // Sign exactly the entry that was checked: the seller's other entries never reach the signer.
  const payload = await signPayment(network, apiKey, { ...required, accepts: [fresh] } as never, fresh as never, addrs).catch((e: Error) => fail(`Couldn't sign the payment: ${e.message}`));
  const signedAmount = (payload as { accepted?: { amount?: string } }).accepted?.amount;
  if (signedAmount !== fresh.amount) return fail("The signed payment didn't match the approved price. Nothing was sent.");
  await sql`UPDATE x402_purchases SET signed_at = now(), updated_at = now() WHERE request_id = ${requestId}`;
  const res = await safeRequest(row.url, { timeoutMs: 45_000, maxBytes: 256 * 1024, headers: { "payment-signature": encode(payload) } });
  if (!res) {
    await sql`UPDATE x402_purchases SET status = 'delivering', error = 'Sent, but the seller did not answer. Not paying again.', updated_at = now() WHERE request_id = ${requestId}`;
    throw new HttpError(502, "upstream", "The seller didn't answer after the payment was sent. Check before trying again.");
  }
  const receipt = decode(res.headers["payment-response"]) as { transaction?: string; amount?: string; errorReason?: string } | null;
  if (res.status >= 200 && res.status < 300) {
    const response = { status: res.status, contentType: res.headers["content-type"] ?? null, body: res.body, truncated: res.truncated, charged: receipt?.amount ?? fresh.amount };
    await sql`UPDATE x402_purchases SET status = 'delivered', result_sealed = ${seal(response, aad(requestId))}, error = NULL, updated_at = now() WHERE request_id = ${requestId}`;
    return { state: "paid", txHash: receipt?.transaction || null };
  }
  return fail(String(receipt?.errorReason ?? `seller answered ${res.status}`));
}

// For people on the team: what an agent's x402 request is buying and what came back.
export type PurchaseDetails = Purchase & { price: string | null; charged: string | null; chain: string | null; scheme: string };

export async function purchaseDetails(session: Session, paymentId: string): Promise<PurchaseDetails | null> {
  const { getPayment } = await import("./payments");
  const payment = await getPayment(session, paymentId); // members only
  const [row] = await sql<Row[]>`SELECT * FROM x402_purchases WHERE request_id = ${payment.id}`;
  if (!row) return null;
  const purchase = (await purchaseFor(payment.id))!;
  const asset = await originAsset(row.entry).catch(() => null);
  const amount = row.route === "wallet" ? row.entry.amount : row.entry.extra?.destination?.amount;
  const priceAsset = row.route === "wallet" ? asset : await assetById(row.entry.extra?.destination?.asset ?? "").catch(() => null);
  const response = purchase.response ? { ...purchase.response, body: purchase.response.body.slice(0, 4000), truncated: purchase.response.truncated || purchase.response.body.length > 4000 } : null;
  return {
    ...purchase, response, scheme: row.entry.scheme, chain: asset?.chainName ?? null,
    price: amount && priceAsset ? `${formatAmount(BigInt(amount), priceAsset.decimals, 2)} ${priceAsset.symbol}` : null,
    charged: purchase.response?.charged && asset && /^\d+$/.test(purchase.response.charged) ? `${formatAmount(BigInt(purchase.response.charged), asset.decimals, 2)} ${asset.symbol}` : null,
  };
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
