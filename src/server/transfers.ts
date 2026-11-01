// Private money movement. Four actions share one pattern: ask NEAR Intents for a price, have the
// person's wallet sign the exact transfer, submit it, and follow it to the end.
//   add      other chain  -> private balance        (a one-time deposit address)
//   swap     private      -> private, another asset
//   send     private      -> another person's private balance
//   withdraw private      -> any address on any chain, in any asset
import { randomUUID } from "node:crypto";
import { formatAmount, parseAmount } from "@/protocol/amount";
import { corridorFor, USDC_NEAR_TO_BASE } from "@/protocol/corridor";
import { intentMismatch, parseIntentMessage } from "@/protocol/intents-auth";
import { normalizeNearAccount } from "@/protocol/identifiers";
import { verifyNep413 } from "@/protocol/nep413";
import { audit } from "./audit";
import type { Session } from "./auth";
import { assetById, catalog, checkAddress, depositModeFor, usdValue, type Asset } from "./assets";
import { PRIVATE_MONEY_MAINNET_ONLY, type Network } from "@/protocol/networks";
import { config } from "./config";
import { sql } from "./db";
import { badRequest, conflict, HttpError, notFound } from "./errors";
import * as oneclick from "./oneclick";
import { emitPaymentEvent } from "./notify";
import { approvedTeamRequest, markTeamRequest } from "./payments";
import { privateAccessToken, toIntentsSignature } from "./private-access";
import { open, seal } from "./secrets";

export type TransferKind = "add" | "swap" | "send" | "withdraw" | "link_payment";
type TransferStatus = "awaiting_deposit" | "awaiting_signature" | "processing" | "success" | "refunded" | "failed" | "expired" | "cancelled";

export type TransferInput = {
  kind: TransferKind;
  fromAssetId?: string;
  toAssetId?: string;
  amount: string; // decimal, in the asset the person is naming (see amountAsset)
  recipient?: string; // send: a NEAR account; withdraw: an address on the destination network
  note?: string;
  teamRequestId?: string;
  // "public": paid straight from the person's NEAR wallet, visible on the chain like any wallet payment.
  privacy?: "private" | "public";
};

export type Preview = {
  kind: TransferKind;
  youPay: { assetId: string; symbol: string; chainName: string; amount: string; usd: number };
  theyGet: { assetId: string; symbol: string; chainName: string; amount: string; usd: number };
  fee: { usd: number };
  minimumReceived: string;
  secondsEstimate: number | null;
  enoughBalance: boolean | null;
};

type Details = {
  kind: TransferKind;
  fromAssetId: string;
  toAssetId: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  recipient: string | null;
  note: string;
  quoteSignature: string;
  intent: { message: string; nonce: string; recipient: string } | null;
  depositChain: string | null;
  depositMinimum: string | null;
  trackAddress: string;
  trackMemo: string | null;
  etaSeconds?: number | null;
  resultHashes: string[];
  public?: boolean; // paid from the wallet: the wallet sends to the deposit address
  // What the private balance held just before the signed transfer was sent. NEAR Intents shows no status for private
  // transfers, so they are confirmed by the balance moving.
  before?: { from: string; to: string };
};

// For deposits on an EVM chain: the chain id and the token contract (null for the chain's own coin),
// so a connected browser wallet can send the deposit itself.
async function evmDeposit(asset: Asset): Promise<{ chainId: number; token: `0x${string}` | null } | null> {
  const id = asset.depositChain?.startsWith("eth:") ? Number(asset.depositChain.slice(4)) : NaN;
  if (!Number.isInteger(id)) return null;
  const token = (await oneclick.tokens()).find((t) => t.assetId === asset.assetId)?.contractAddress ?? null;
  if (token && !/^0x[0-9a-fA-F]{40}$/.test(token)) return null;
  return { chainId: id, token: token as `0x${string}` | null };
}

// For deposits on Solana: the token's mint address (null for SOL itself), so a connected Solana wallet can send it.
async function solanaDeposit(asset: Asset): Promise<{ mint: string | null } | null> {
  if (!asset.depositChain?.startsWith("sol:")) return null;
  const mint = (await oneclick.tokens()).find((t) => t.assetId === asset.assetId)?.contractAddress ?? null;
  if (mint && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return null;
  return { mint };
}

// FLEX_INPUT deposits still need a quote amount the route accepts; the minimum shown follows from it.
// Use the bridge's published minimum, except where it is missing or a single unit (which the route
// refuses): then ask for about one dollar's worth, or one whole coin when there's no price.
function quoteAmountFor(asset: Asset): string {
  const dollar = asset.priceUsd ? BigInt(Math.max(1, Math.ceil(10 ** asset.decimals / asset.priceUsd))) : 10n ** BigInt(asset.decimals);
  const published = asset.minDeposit ? BigInt(asset.minDeposit) : 0n;
  return (published > 1n ? published : dollar).toString();
}

export type Transfer = {
  id: string;
  kind: TransferKind;
  status: TransferStatus;
  createdAt: Date;
  expiresAt: Date;
  fromAsset: Pick<Asset, "assetId" | "symbol" | "chainName" | "decimals" | "icon" | "chainIcon">;
  toAsset: Pick<Asset, "assetId" | "symbol" | "chainName" | "decimals" | "icon" | "chainIcon">;
  amountIn: string;
  amountOut: string;
  recipient: string | null;
  note: string;
  deposit: { address: string; memo: string | null; chainName: string; minimum: string | null; evm: { chainId: number; token: `0x${string}` | null } | null; solana: { mint: string | null } | null } | null; // evm, solana: let a connected wallet pay it in one tap
  intentToSign: { message: string; nonce: string; recipient: string } | null;
  resultHashes: string[];
  etaSeconds: number | null;
  teamRequestId: string | null;
  fromWallet: boolean;
};

const aad = (id: string, account: string) => `transfer:${id}:${account}`;
const light = (a: Asset) => ({ assetId: a.assetId, symbol: a.symbol, chainName: a.chainName, decimals: a.decimals, icon: a.icon, chainIcon: a.chainIcon });

function requireEnabled(network: Network) {
  if (network !== "mainnet") throw new HttpError(503, "mainnet_only", PRIVATE_MONEY_MAINNET_ONLY);
  if (!config.oneClickApiKey) {
    throw new HttpError(503, "not_enabled", "Sending isn't available right now. Please try again later.");
  }
}

type Plan = {
  request: Omit<oneclick.QuoteRequest, "dry" | "deadline">;
  from: Asset;
  to: Asset;
  amountAsset: Asset;
  recipient: string | null;
  needsUserToken: boolean;
  deadlineMinutes: number;
  public: boolean;
};

async function plan(session: Session, input: TransferInput): Promise<Plan> {
  const account = session.accountId;
  const note = (input.note ?? "").trim();
  if (note.length > 140) throw badRequest("Keep the note under 140 characters.");
  const toMinor = (asset: Asset) => {
    try {
      const value = parseAmount(String(input.amount ?? ""), asset.decimals);
      if (value <= 0n) throw new RangeError("Amount must be greater than zero.");
      return value;
    } catch (error) {
      throw badRequest((error as Error).message);
    }
  };
  const base = { slippageTolerance: 100 };

  // From the wallet: the wallet sends a coin it holds on NEAR to a one-time NEAR Intents address, and the
  // result goes straight to the recipient's chain (or back to the wallet, for a swap). Public end to end.
  if (input.privacy === "public" && input.kind !== "add") {
    const from = await assetById(String(input.fromAssetId ?? ""));
    if (from.chain !== "near") throw badRequest("Your wallet can pay with coins it holds on NEAR.");
    const to = await assetById(String(input.toAssetId ?? input.fromAssetId ?? ""));
    const out = { ...base, originAsset: from.assetId, depositType: "ORIGIN_CHAIN" as const, destinationAsset: to.assetId, refundTo: account, refundType: "ORIGIN_CHAIN" as const, recipientType: "DESTINATION_CHAIN" as const };
    if (input.kind === "swap") {
      if (from.assetId === to.assetId) throw badRequest("Choose two different assets to swap.");
      if (to.chain !== "near") throw badRequest("Swaps from your wallet come back to your wallet, so choose a coin on NEAR.");
      return { from, to, amountAsset: from, recipient: account, needsUserToken: false, deadlineMinutes: 30, public: true,
        request: { ...out, swapType: "EXACT_INPUT", amount: toMinor(from).toString(), recipient: account } };
    }
    if (input.kind === "send") throw badRequest("Your wallet sends to a NEAR account directly.");
    const recipient = checkAddress(to, String(input.recipient ?? ""));
    return { from, to, amountAsset: to, recipient, needsUserToken: false, deadlineMinutes: 30, public: true,
      request: { ...out, swapType: "EXACT_OUTPUT", amount: toMinor(to).toString(), recipient } };
  }

  // Into the wallet: the coin is sent on its own chain to a one-time NEAR Intents address and arrives in the
  // person's NEAR wallet as the same coin on NEAR. A coin already on NEAR needs no route: it goes straight to the wallet.
  if (input.kind === "add" && input.privacy === "public") {
    const from = await assetById(String(input.fromAssetId ?? ""));
    if (from.chain === "near") throw badRequest("Coins on NEAR go straight to your wallet's address.");
    const matches = (await catalog()).filter((a) => a.chain === "near" && a.symbol === from.symbol);
    const to = matches.length === 1 ? matches[0] : undefined;
    if (!to) throw badRequest(`${from.symbol} can't arrive in a NEAR wallet. Add it to your private balance instead.`);
    return {
      from, to, amountAsset: from, recipient: account, needsUserToken: false, deadlineMinutes: 24 * 60, public: true,
      request: { ...base, swapType: "FLEX_INPUT", originAsset: from.assetId, depositType: "ORIGIN_CHAIN", ...depositModeFor(from), destinationAsset: to.assetId,
        amount: quoteAmountFor(from), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient: account,
        recipientType: "DESTINATION_CHAIN", quoteWaitingTimeMs: 5000 },
    };
  }

  if (input.kind === "add") {
    const asset = await assetById(String(input.fromAssetId ?? ""));
    if (!asset.depositChain) throw badRequest("You can't add money from this network yet.");
    return {
      from: asset, to: asset, amountAsset: asset, recipient: null, needsUserToken: false, deadlineMinutes: 24 * 60, public: false,
      request: { ...base, swapType: "FLEX_INPUT", originAsset: asset.assetId, depositType: "INTENTS", destinationAsset: asset.assetId,
        amount: quoteAmountFor(asset), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient: account,
        recipientType: "CONFIDENTIAL_INTENTS", quoteWaitingTimeMs: 5000 },
    };
  }

  if (input.kind === "swap") {
    const from = await assetById(String(input.fromAssetId ?? ""));
    const to = await assetById(String(input.toAssetId ?? ""));
    if (from.assetId === to.assetId) throw badRequest("Choose two different assets to swap.");
    return {
      from, to, amountAsset: from, recipient: null, needsUserToken: true, deadlineMinutes: 15, public: false,
      request: { ...base, swapType: "EXACT_INPUT", originAsset: from.assetId, depositType: "CONFIDENTIAL_INTENTS", destinationAsset: to.assetId,
        amount: toMinor(from).toString(), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient: account, recipientType: "CONFIDENTIAL_INTENTS" },
    };
  }

  if (input.kind === "send") {
    const asset = await assetById(String(input.fromAssetId ?? ""));
    const recipient = normalizeNearAccount(String(input.recipient ?? ""));
    if (!recipient) throw badRequest("Enter the recipient's NEAR account, ending in .near.");
    if (recipient === account) throw badRequest("That's your own account.");
    return {
      from: asset, to: asset, amountAsset: asset, recipient, needsUserToken: true, deadlineMinutes: 15, public: false,
      request: { ...base, swapType: "EXACT_OUTPUT", originAsset: asset.assetId, depositType: "CONFIDENTIAL_INTENTS", destinationAsset: asset.assetId,
        amount: toMinor(asset).toString(), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient, recipientType: "CONFIDENTIAL_INTENTS" },
    };
  }

  const from = await assetById(String(input.fromAssetId ?? ""));
  const to = await assetById(String(input.toAssetId ?? input.fromAssetId ?? ""));
  const recipient = checkAddress(to, String(input.recipient ?? ""));
  return {
    from, to, amountAsset: to, recipient, needsUserToken: true, deadlineMinutes: 15, public: false,
    request: { ...base, swapType: "EXACT_OUTPUT", originAsset: from.assetId, depositType: "CONFIDENTIAL_INTENTS", destinationAsset: to.assetId,
      amount: toMinor(to).toString(), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient, recipientType: "DESTINATION_CHAIN" },
  };
}

// Everything the person holds privately, by coin; null when it can't be read right now.
async function heldPrivately(session: Session): Promise<Record<string, bigint> | null> {
  try {
    const { balances } = await oneclick.balances(await privateAccessToken(session));
    return Object.fromEntries(balances.map((b) => [b.tokenId, BigInt(b.available)]));
  } catch {
    return null;
  }
}

// A private swap is done when its coin has arrived; a private send or withdrawal when the coin has left.
function movedPrivately(kind: TransferKind, d: Details, held: Record<string, bigint>): boolean {
  if (!d.before) return false;
  if (kind === "swap") return (held[d.toAssetId] ?? 0n) >= BigInt(d.before.to) + BigInt(d.minAmountOut);
  return (held[d.fromAssetId] ?? 0n) <= BigInt(d.before.from) - BigInt(d.amountIn);
}

async function ownBalance(session: Session, assetId: string): Promise<bigint | null> {
  try {
    const { balances } = await oneclick.balances(await privateAccessToken(session));
    return BigInt(balances.find((b) => b.tokenId === assetId)?.available ?? "0");
  } catch {
    return null;
  }
}

export async function preview(session: Session, input: TransferInput): Promise<Preview> {
  requireEnabled(session.network);
  const p = await plan(session, input);
  const token = p.needsUserToken ? await privateAccessToken(session) : undefined;
  const q = await oneclick.quote({ ...p.request, dry: true, deadline: new Date(Date.now() + p.deadlineMinutes * 60_000).toISOString() }, token);
  const paid = BigInt(q.quote.amountIn);
  const got = BigInt(q.quote.amountOut);
  const balance = input.kind === "add" || p.public ? null : await ownBalance(session, p.from.assetId);
  const payUsd = usdValue(p.from, paid);
  const getUsd = usdValue(p.to, got);
  return {
    kind: input.kind,
    youPay: { assetId: p.from.assetId, symbol: p.from.symbol, chainName: p.from.chainName, amount: paid.toString(), usd: payUsd },
    theyGet: { assetId: p.to.assetId, symbol: p.to.symbol, chainName: p.to.chainName, amount: got.toString(), usd: getUsd },
    fee: { usd: Math.max(0, payUsd - getUsd) },
    minimumReceived: q.quote.minAmountOut,
    secondsEstimate: q.quote.timeEstimate ?? null,
    enoughBalance: balance === null ? null : balance >= paid,
  };
}

type Row = { id: string; account_id: string; kind: TransferKind; status: TransferStatus; deposit_address: string | null; deposit_memo: string | null; intent_hash: string | null; details_sealed: string; team_request_id: string | null; pay_link_id: string | null; expires_at: Date; created_at: Date };

async function toTransfer(row: Row): Promise<Transfer> {
  const d = open<Details>(row.details_sealed, aad(row.id, row.account_id));
  const [from, to] = await Promise.all([assetById(d.fromAssetId), assetById(d.toAssetId)]);
  return {
    id: row.id, kind: row.kind, status: row.status, createdAt: row.created_at, expiresAt: row.expires_at,
    fromAsset: light(from), toAsset: light(to), amountIn: d.amountIn, amountOut: d.amountOut, recipient: d.recipient, note: d.note,
    deposit: (row.kind === "add" || row.kind === "link_payment" || d.public) && row.deposit_address
      ? { address: row.deposit_address, memo: row.deposit_memo, chainName: from.chainName, minimum: d.depositMinimum, evm: row.deposit_memo ? null : await evmDeposit(from), solana: row.deposit_memo ? null : await solanaDeposit(from) } : null,
    intentToSign: row.status === "awaiting_signature" ? d.intent : null,
    resultHashes: d.resultHashes, etaSeconds: d.etaSeconds ?? null, teamRequestId: row.team_request_id, fromWallet: d.public === true,
  };
}

async function save(id: string, accountId: string, status: TransferStatus, details: Details, extra: { intentHash?: string } = {}) {
  await sql`UPDATE transfers SET status = ${status}, details_sealed = ${seal(details, aad(id, accountId))},
    intent_hash = COALESCE(${extra.intentHash ?? null}, intent_hash), updated_at = now() WHERE id = ${id}`;
}

export async function createTransfer(session: Session, input: TransferInput): Promise<Transfer> {
  requireEnabled(session.network);
  const p = await plan(session, input);
  const token = p.needsUserToken ? await privateAccessToken(session) : undefined;
  const deadline = new Date(Date.now() + p.deadlineMinutes * 60_000);
  const q = await oneclick.quote({ ...p.request, dry: false, deadline: deadline.toISOString() }, token);
  const depositAddress = q.quote.depositAddress;
  if (!depositAddress) throw new HttpError(502, "upstream", "The payment network did not return a route. Try again.");
  const id = randomUUID();

  const details: Details = {
    kind: input.kind, fromAssetId: p.from.assetId, toAssetId: p.to.assetId, amountIn: q.quote.amountIn, amountOut: q.quote.amountOut,
    minAmountOut: q.quote.minAmountOut, recipient: p.recipient, note: (input.note ?? "").trim(), quoteSignature: q.signature,
    intent: null, depositChain: p.from.depositChain, depositMinimum: q.quote.minAmountIn ?? null,
    trackAddress: depositAddress, trackMemo: q.quote.depositMemo ?? null, etaSeconds: q.quote.timeEstimate ?? null, resultHashes: [],
    ...(p.public ? { public: true } : {}),
  };
  let status: TransferStatus;
  let address = depositAddress;
  let memo: string | null = q.quote.depositMemo ?? null;

  if (input.kind === "add" && !p.public) {
    const bridge = await oneclick.bridgeDepositAddress(depositAddress, p.from.depositChain!);
    address = bridge.address;
    memo = bridge.memo ?? memo;
    status = "awaiting_deposit";
  } else if (p.public) {
    status = "awaiting_deposit";
  } else {
    const { intent } = await oneclick.generateIntent(depositAddress, session.accountId);
    // The intent must do exactly what the quote said: right signer, right coin, no more than the quoted
    // amount, only to the quote's deposit address, expiring in time. Otherwise nobody is asked to sign it.
    // NEAR Intents may give the transfer the quote's own expiry rather than the one asked for, so the
    // later of the two is allowed, never more than a week out. The transfer can only pay this quote's
    // deposit address, with no more than the quoted amount; anything not executed comes back to the sender.
    const quotedDeadline = q.quote.deadline ? Date.parse(q.quote.deadline) : NaN;
    const notAfter = new Date(Math.min(Math.max(deadline.getTime(), Number.isFinite(quotedDeadline) ? quotedDeadline : 0), Date.now() + 7 * 86_400_000));
    const mismatch = intentMismatch(intent.payload, { signerId: session.accountId, depositAddress, assetId: p.from.assetId, maxAmount: BigInt(q.quote.amountIn), notAfter });
    if (mismatch) {
      // The shape only (field names), never amounts or addresses, so a format change can be diagnosed.
      const shape = (v: unknown): unknown => (Array.isArray(v) ? v.map(shape) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).map((k) => [k, shape((v as Record<string, unknown>)[k])])) : typeof v);
      const late = mismatch === "deadline" ? ` (${Math.round((Date.parse(parseIntentMessage(intent.payload.message)?.deadline ?? "") - notAfter.getTime()) / 60_000)} min past the limit)` : "";
      console.error("[transfers] intent refused:", mismatch + late, JSON.stringify(shape(parseIntentMessage(intent.payload.message))));
      throw new HttpError(502, "upstream", "The payment network returned an unexpected transfer. Nothing was sent.");
    }
    details.intent = intent.payload;
    status = "awaiting_signature";
  }

  let teamRequestId: string | null = null;
  if (input.teamRequestId) {
    const request = await approvedTeamRequest(session, input.teamRequestId);
    teamRequestId = request.id;
  }

  await sql.begin(async (tx) => {
    if (teamRequestId) {
      // One payout at a time per request: lock it, and refuse while another payout is open or done.
      const [request] = await tx<{ status: string }[]>`SELECT status FROM payment_requests WHERE id = ${teamRequestId} FOR UPDATE`;
      if (request?.status !== "approved") throw conflict("This request is not approved, or it was already paid.");
      const open = await tx`
        SELECT 1 FROM transfers WHERE team_request_id = ${teamRequestId}
          AND (status IN ('processing', 'success') OR (status IN ('awaiting_signature', 'awaiting_deposit') AND expires_at > now()))`;
      if (open.length) throw conflict("This request is already being paid.");
    }
    await tx`INSERT INTO transfers (id, account_id, network, kind, status, deposit_address, deposit_memo, details_sealed, team_request_id, expires_at)
      VALUES (${id}, ${session.accountId}, ${session.network}, ${input.kind}, ${status}, ${address}, ${memo}, ${seal(details, aad(id, session.accountId))}, ${teamRequestId}, ${deadline})`;
    await audit(tx, null, { type: "human", id: session.accountId }, `transfer.${input.kind}.created`, id);
  });
  const [row] = await sql<Row[]>`SELECT * FROM transfers WHERE id = ${id}`;
  return toTransfer(row);
}

// The wallet signed the transfer. Verify it is the exact payload we issued and the key is the
// signed-in key, then submit it. A transfer can be submitted once.
export async function submitSigned(session: Session, id: string, signed: { publicKey: string; signature: string }): Promise<Transfer> {
  const row = await mine(session, id);
  if (row.status !== "awaiting_signature") throw conflict("This transfer was already sent or is no longer open.");
  const details = open<Details>(row.details_sealed, aad(row.id, row.account_id));
  if (!details.intent) throw conflict("This transfer has nothing to sign.");
  if (signed.publicKey !== session.publicKey) throw badRequest("Sign with the wallet you signed in with.");
  const valid = verifyNep413({ message: details.intent.message, nonce: Buffer.from(details.intent.nonce, "base64"), recipient: details.intent.recipient }, signed.publicKey, signed.signature);
  if (!valid) throw badRequest("That signature doesn't match this transfer.");
  if (row.expires_at < new Date()) {
    await save(row.id, row.account_id, "expired", details);
    throw conflict("This transfer expired. Start it again to get a fresh price.");
  }

  // A team payout goes out only while its request is still approved (not cancelled, not already paid).
  if (row.team_request_id) {
    const moved = await sql.begin((tx) => markTeamRequest(tx, row.team_request_id!, "submitting", { type: "human", id: session.accountId }, ["approved"], row.id));
    if (!moved) {
      await sql`UPDATE transfers SET status = 'cancelled', updated_at = now() WHERE id = ${id} AND status = 'awaiting_signature'`;
      throw conflict("This request was cancelled or already paid, so nothing was sent.");
    }
  }
  const claimed = await sql`UPDATE transfers SET status = 'processing', updated_at = now() WHERE id = ${id} AND status = 'awaiting_signature' RETURNING id`;
  if (claimed.length !== 1) {
    if (row.team_request_id) await sql.begin((tx) => markTeamRequest(tx, row.team_request_id!, "approved", { type: "system", id: "scrim" }, ["submitting"], row.id));
    throw conflict("This transfer was already sent.");
  }
  const held = await heldPrivately(session);
  if (held) details.before = { from: String(held[details.fromAssetId] ?? 0n), to: String(held[details.toAssetId] ?? 0n) };
  try {
    const { intentHash } = await oneclick.submitIntent({
      standard: "nep413",
      payload: details.intent,
      public_key: signed.publicKey,
      signature: toIntentsSignature(signed.signature),
    });
    await save(row.id, row.account_id, "processing", details, { intentHash });
    if (row.team_request_id) emitPaymentEvent(row.team_request_id, "payment.submitting");
    await sql.begin((tx) => audit(tx, null, { type: "human", id: session.accountId }, `transfer.${row.kind}.submitted`, id));
  } catch (error) {
    await save(row.id, row.account_id, "failed", details);
    if (row.team_request_id) await sql.begin((tx) => markTeamRequest(tx, row.team_request_id!, "approved", { type: "system", id: "scrim" }, ["submitting"], row.id));
    throw error;
  }
  return refreshOne(session, id);
}

async function mine(session: Session, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Transfer not found.");
  const [row] = await sql<Row[]>`SELECT * FROM transfers WHERE id = ${id} AND account_id = ${session.accountId} AND network = ${session.network}`;
  if (!row) throw notFound("Transfer not found.");
  return row;
}

const END_STATE: Record<string, TransferStatus> = { SUCCESS: "success", REFUNDED: "refunded", FAILED: "failed" };
// The deposit has reached NEAR Intents (even if not fully, or not yet processed): money has left the payer.
const DEPOSIT_SEEN = new Set(["KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT", "PROCESSING"]);

async function refreshOne(session: Session, id: string): Promise<Transfer> {
  const row = await mine(session, id);
  const held = row.status === "processing" && row.intent_hash ? await heldPrivately(session) : null;
  return refreshRow(row, held);
}

// Follows a transfer to the end and records the result. Safe to call from a person's session or
// from the public payment-link page, which holds only the transfer's random ID.
async function refreshRow(row: Row, held: Record<string, bigint> | null = null): Promise<Transfer> {
  const id = row.id;
  const sealed = open<Details>(row.details_sealed, aad(row.id, row.account_id));
  // A wallet pays on its own, so a wallet transfer closed here may still have been paid: keep following it for two days.
  const lateWalletPayment = sealed.public === true && (row.status === "expired" || row.status === "cancelled") && row.created_at.getTime() > Date.now() - 2 * 86_400_000;
  if (row.status === "awaiting_deposit" || row.status === "processing" || lateWalletPayment) {
    try {
      const details = sealed;
      // A signed private transfer has no status on NEAR Intents' side: it is confirmed by the balance moving.
      const byBalance = Boolean(row.intent_hash && details.before);
      const s = byBalance ? null : await oneclick.status(details.trackAddress, details.trackMemo);
      const ended: TransferStatus | undefined = byBalance ? (held && movedPrivately(row.kind, details, held) ? "success" : undefined) : END_STATE[s!.status];
      // Only money that arrived counts: a closed wallet payout that was never paid leaves its request approved.
      if (ended === "success" && row.team_request_id && details.public) await walletPayoutSent(row);
      if (ended) {
        details.resultHashes = s?.swapDetails?.destinationChainTxHashes?.map((h) => h.hash) ?? details.resultHashes;
        await save(row.id, row.account_id, ended, details);
        if (row.team_request_id) {
          const outcome = ended === "success" ? "settled" : ended === "refunded" ? "approved" : "failed";
          const moved = await sql.begin((tx) => markTeamRequest(tx, row.team_request_id!, outcome, { type: "system", id: "intents" }, ["submitting"], row.id));
          if (moved) emitPaymentEvent(row.team_request_id, `payment.${outcome}`);
          // An agent's x402 purchase: now that the seller's deposit is paid, collect what it sells.
          if (moved && outcome === "settled") {
            const requestId = row.team_request_id;
            void import("./x402-client").then((m) => m.deliverPurchase(requestId)).catch((e) => console.error("[x402] delivery", e));
          }
        }
        // A product stays open for the next buyer; a one-off link is done once paid.
        if (row.pay_link_id && ended === "success") await sql`UPDATE pay_links SET status = 'paid' WHERE id = ${row.pay_link_id} AND status = 'open' AND product_sealed IS NULL`;
      } else if (s && DEPOSIT_SEEN.has(s.status) && row.status !== "processing") {
        await save(row.id, row.account_id, "processing", details);
        await walletPayoutSent(row);
      } else if (s && row.status === "processing") {
        console.info("[transfers] still open:", row.id, row.kind, s.status);
      }
    } catch (error) {
      // The network is briefly unreachable: keep the last known state.
      if (row.status === "processing") console.error("[transfers] status lookup failed:", row.id, row.kind, (error as Error).message);
    }
  }
  const [fresh] = await sql<Row[]>`SELECT * FROM transfers WHERE id = ${id}`;
  if ((fresh.status === "awaiting_deposit" || fresh.status === "awaiting_signature") && fresh.expires_at < new Date()) {
    await sql`UPDATE transfers SET status = 'expired', updated_at = now() WHERE id = ${id} AND status IN ('awaiting_deposit', 'awaiting_signature')`;
    const [expired] = await sql<Row[]>`SELECT * FROM transfers WHERE id = ${id}`;
    return toTransfer(expired);
  }
  return toTransfer(fresh);
}

export const getTransfer = refreshOne;

// A payout paid from the owner's wallet: once the money is on its way, the request is being paid.
async function walletPayoutSent(row: Row) {
  if (!row.team_request_id || !open<Details>(row.details_sealed, aad(row.id, row.account_id)).public) return;
  const moved = await sql.begin((tx) => markTeamRequest(tx, row.team_request_id!, "submitting", { type: "human", id: row.account_id }, ["approved"], row.id));
  if (moved) emitPaymentEvent(row.team_request_id, "payment.submitting");
}

// The wallet sent its coins to a public transfer's deposit address: tell NEAR Intents so it's picked up
// sooner, and follow it from there.
export async function depositSent(session: Session, id: string, txHash: string): Promise<Transfer> {
  const row = await mine(session, id);
  if (row.status !== "awaiting_deposit") return refreshRow(row);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(txHash)) throw badRequest("That transaction hash doesn't look right.");
  await oneclick.submitDeposit(txHash, row.deposit_address!, row.deposit_memo).catch(() => null);
  return refreshRow(row);
}

export async function listTransfers(session: Session): Promise<Transfer[]> {
  const rows = await sql<Row[]>`SELECT * FROM transfers WHERE account_id = ${session.accountId} AND network = ${session.network} ORDER BY created_at DESC LIMIT 100`;
  return Promise.all(rows.map(toTransfer));
}

export async function cancelTransfer(session: Session, id: string): Promise<Transfer> {
  const row = await mine(session, id);
  if (!["awaiting_deposit", "awaiting_signature"].includes(row.status)) throw conflict("This transfer can no longer be cancelled.");
  await sql`UPDATE transfers SET status = 'cancelled', updated_at = now() WHERE id = ${id} AND status IN ('awaiting_deposit', 'awaiting_signature')`;
  return toTransfer(await mine(session, id));
}

// Pay an approved request out to the destination on Base (mainnet): from the owner's private balance, or
// from their NEAR wallet in public, as they choose.
export async function payTeamRequest(session: Session, requestId: string, privacy: "private" | "public" = "private"): Promise<Transfer> {
  if (session.network !== "mainnet") throw new HttpError(400, "wrong_network", "On testnet, pay with your wallet: it sends real test NEAR straight to the recipient.");
  // An earlier payout from the wallet may have been paid after it closed here: catch up before paying again.
  const earlier = await sql<Row[]>`SELECT * FROM transfers WHERE team_request_id = ${requestId} AND status IN ('awaiting_deposit', 'expired', 'cancelled') AND created_at > now() - interval '2 days'`;
  for (const row of earlier) await refreshRow(row).catch(() => null);
  const request = await approvedTeamRequest(session, requestId);
  const corridor = corridorFor("mainnet");
  return createTransfer(session, {
    kind: "withdraw",
    fromAssetId: USDC_NEAR_TO_BASE.assetId,
    toAssetId: USDC_NEAR_TO_BASE.destinationAssetId,
    amount: formatAmount(BigInt(request.amount), corridor.decimals, 0),
    recipient: request.recipient,
    note: request.memo,
    teamRequestId: request.id,
    privacy,
  });
}

// A payer with no account pays a link from any chain. The money lands in the requester's private balance.
export async function createLinkPayment(link: { id: string; accountId: string; network: Network; assetId: string; amount: string; note: string; expiresAt: Date; receive: "private" | "wallet" }, input: { fromAssetId: string; refundAddress: string }): Promise<Transfer> {
  requireEnabled(link.network);
  const from = await assetById(String(input.fromAssetId ?? ""));
  const to = await assetById(link.assetId);
  const refundTo = checkAddress(from, String(input.refundAddress ?? ""));
  // A product is bought by many people at once; a one-off link has one payer.
  const [{ product }] = await sql<{ product: boolean }[]>`SELECT product_sealed IS NOT NULL AS product FROM pay_links WHERE id = ${link.id}`;
  const row = await sql.begin(async (tx) => {
    // Two payers starting a one-off link together take turns here, so the second sees the first's payment.
    if (!product) await tx`SELECT pg_advisory_xact_lock(hashtext(${`paylink:${link.id}`}))`;
    const [{ open: openAttempts }] = await tx<{ open: number }[]>`SELECT count(*)::int AS open FROM transfers WHERE pay_link_id = ${link.id} AND ((status = 'awaiting_deposit' AND expires_at > now()) OR status = 'processing')`;
    // A one-off link is paid once: while someone is paying it, nobody else can start (a second payment would
    // reach the owner with no way back). A product can be bought by many at once.
    if (openAttempts >= (product ? 200 : 1)) throw conflict(product ? "This link has too many unfinished payments. Try again in a few minutes." : "Someone is already paying this link. Try again in a few minutes.");

    const deadline = new Date(Math.min(link.expiresAt.getTime(), Date.now() + 60 * 60_000));
    const q = await oneclick.quote({
      dry: false, swapType: "EXACT_OUTPUT", slippageTolerance: 100, originAsset: from.assetId, depositType: "ORIGIN_CHAIN", ...depositModeFor(from),
      destinationAsset: to.assetId, amount: link.amount, refundTo, refundType: "ORIGIN_CHAIN", recipient: link.accountId,
      // The owner chose: into their private balance, or straight into their NEAR wallet.
      recipientType: link.receive === "wallet" ? "DESTINATION_CHAIN" : "CONFIDENTIAL_INTENTS", deadline: deadline.toISOString(), quoteWaitingTimeMs: 5000,
  });
  const depositAddress = q.quote.depositAddress;
  if (!depositAddress) throw new HttpError(502, "upstream", "No route is available for that coin right now. Try another.");
  const id = randomUUID();
  const memo = q.quote.depositMemo ?? null;
  const details: Details = {
    kind: "link_payment", fromAssetId: from.assetId, toAssetId: to.assetId, amountIn: q.quote.amountIn, amountOut: q.quote.amountOut,
    minAmountOut: q.quote.minAmountOut, recipient: link.accountId, note: link.note, quoteSignature: q.signature, intent: null,
    depositChain: from.depositChain, depositMinimum: q.quote.minAmountIn ?? null, trackAddress: depositAddress, trackMemo: memo, resultHashes: [],
  };
  await tx`INSERT INTO transfers (id, account_id, network, kind, status, deposit_address, deposit_memo, details_sealed, pay_link_id, expires_at)
    VALUES (${id}, ${link.accountId}, ${link.network}, 'link_payment', 'awaiting_deposit', ${depositAddress}, ${memo}, ${seal(details, aad(id, link.accountId))}, ${link.id}, ${deadline})`;
  const [inserted] = await tx<Row[]>`SELECT * FROM transfers WHERE id = ${id}`;
  return inserted;
  });
  return toTransfer(row);
}

// The owner's record of payments made to one of their links or products.
export async function linkPayments(session: Session, linkId: string): Promise<Transfer[]> {
  const rows = await sql<Row[]>`SELECT * FROM transfers WHERE account_id = ${session.accountId} AND pay_link_id = ${linkId} AND kind = 'link_payment' ORDER BY created_at DESC LIMIT 200`;
  return Promise.all(rows.map(toTransfer));
}

// Public status for a payer: only the transfer's random ID is needed, and only that payment is shown.
export async function linkPaymentStatus(linkId: string, transferId: string): Promise<Pick<Transfer, "id" | "status" | "deposit" | "amountIn" | "fromAsset" | "expiresAt">> {
  if (!/^[0-9a-f-]{36}$/i.test(transferId)) throw notFound("Payment not found.");
  const [row] = await sql<Row[]>`SELECT * FROM transfers WHERE id = ${transferId} AND pay_link_id = ${linkId} AND kind = 'link_payment'`;
  if (!row) throw notFound("Payment not found.");
  const t = await refreshRow(row);
  return { id: t.id, status: t.status, deposit: t.deposit, amountIn: t.amountIn, fromAsset: t.fromAsset, expiresAt: t.expiresAt };
}
