// Private money movement. Four actions share one pattern: ask NEAR Intents for a price, have the
// person's wallet sign the exact transfer, submit it, and follow it to the end.
//   add      other chain  -> private balance        (a one-time deposit address)
//   swap     private      -> private, another asset
//   send     private      -> another person's private balance
//   withdraw private      -> any address on any chain, in any asset
import { randomUUID } from "node:crypto";
import { parseAmount } from "@/protocol/amount";
import { USDC_NEAR_TO_BASE } from "@/protocol/corridor";
import { parseIntentMessage } from "@/protocol/intents-auth";
import { normalizeNearAccount } from "@/protocol/identifiers";
import { verifyNep413 } from "@/protocol/nep413";
import { audit } from "./audit";
import type { Session } from "./auth";
import { assetById, checkAddress, usdValue, type Asset } from "./assets";
import { config } from "./config";
import { sql } from "./db";
import { badRequest, conflict, HttpError, notFound } from "./errors";
import * as oneclick from "./oneclick";
import { approvedTeamRequest, markTeamRequest } from "./payments";
import { privateAccessToken, toIntentsSignature } from "./private-access";
import { open, seal } from "./secrets";

export type TransferKind = "add" | "swap" | "send" | "withdraw";
export type TransferStatus = "awaiting_deposit" | "awaiting_signature" | "processing" | "success" | "refunded" | "failed" | "expired" | "cancelled";

export type TransferInput = {
  kind: TransferKind;
  fromAssetId?: string;
  toAssetId?: string;
  amount: string; // decimal, in the asset the person is naming (see amountAsset)
  recipient?: string; // send: a NEAR account; withdraw: an address on the destination network
  note?: string;
  teamRequestId?: string;
};

export type Preview = {
  kind: TransferKind;
  youPay: { assetId: string; symbol: string; networkName: string; amount: string; usd: number };
  theyGet: { assetId: string; symbol: string; networkName: string; amount: string; usd: number };
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
  resultHashes: string[];
};

export type Transfer = {
  id: string;
  kind: TransferKind;
  status: TransferStatus;
  createdAt: Date;
  expiresAt: Date;
  fromAsset: Pick<Asset, "assetId" | "symbol" | "networkName" | "decimals">;
  toAsset: Pick<Asset, "assetId" | "symbol" | "networkName" | "decimals">;
  amountIn: string;
  amountOut: string;
  recipient: string | null;
  note: string;
  deposit: { address: string; memo: string | null; network: string; minimum: string | null } | null;
  intentToSign: { message: string; nonce: string; recipient: string } | null;
  resultHashes: string[];
  teamRequestId: string | null;
};

const aad = (id: string, account: string) => `transfer:${id}:${account}`;
const light = (a: Asset) => ({ assetId: a.assetId, symbol: a.symbol, networkName: a.networkName, decimals: a.decimals });

function requireEnabled() {
  if (config.network !== "mainnet") throw new HttpError(503, "mainnet_only", "Private money works on NEAR mainnet.");
  if (!config.oneClickApiKey) {
    throw new HttpError(503, "not_enabled", "Private transfers aren't switched on yet. Your balance and activity are still available.");
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

  if (input.kind === "add") {
    const asset = await assetById(String(input.fromAssetId ?? ""));
    if (!asset.depositChain) throw badRequest("You can't add money from this network yet.");
    return {
      from: asset, to: asset, amountAsset: asset, recipient: null, needsUserToken: false, deadlineMinutes: 24 * 60,
      request: { ...base, swapType: "FLEX_INPUT", originAsset: asset.assetId, depositType: "INTENTS", destinationAsset: asset.assetId,
        amount: (asset.minDeposit ?? "1").toString(), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient: account,
        recipientType: "CONFIDENTIAL_INTENTS", quoteWaitingTimeMs: 5000 },
    };
  }

  if (input.kind === "swap") {
    const from = await assetById(String(input.fromAssetId ?? ""));
    const to = await assetById(String(input.toAssetId ?? ""));
    if (from.assetId === to.assetId) throw badRequest("Choose two different assets to swap.");
    return {
      from, to, amountAsset: from, recipient: null, needsUserToken: true, deadlineMinutes: 15,
      request: { ...base, swapType: "EXACT_INPUT", originAsset: from.assetId, depositType: "CONFIDENTIAL_INTENTS", destinationAsset: to.assetId,
        amount: toMinor(from).toString(), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient: account, recipientType: "CONFIDENTIAL_INTENTS" },
    };
  }

  if (input.kind === "send") {
    const asset = await assetById(String(input.fromAssetId ?? ""));
    const recipient = normalizeNearAccount(String(input.recipient ?? ""));
    if (!recipient) throw badRequest("Enter the recipient's NEAR account, like alice.near.");
    if (recipient === account) throw badRequest("That's your own account.");
    return {
      from: asset, to: asset, amountAsset: asset, recipient, needsUserToken: true, deadlineMinutes: 15,
      request: { ...base, swapType: "EXACT_OUTPUT", originAsset: asset.assetId, depositType: "CONFIDENTIAL_INTENTS", destinationAsset: asset.assetId,
        amount: toMinor(asset).toString(), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient, recipientType: "CONFIDENTIAL_INTENTS" },
    };
  }

  const from = await assetById(String(input.fromAssetId ?? ""));
  const to = await assetById(String(input.toAssetId ?? input.fromAssetId ?? ""));
  const recipient = checkAddress(to.network, String(input.recipient ?? ""));
  return {
    from, to, amountAsset: to, recipient, needsUserToken: true, deadlineMinutes: 15,
    request: { ...base, swapType: "EXACT_OUTPUT", originAsset: from.assetId, depositType: "CONFIDENTIAL_INTENTS", destinationAsset: to.assetId,
      amount: toMinor(to).toString(), refundTo: account, refundType: "CONFIDENTIAL_INTENTS", recipient, recipientType: "DESTINATION_CHAIN" },
  };
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
  requireEnabled();
  const p = await plan(session, input);
  const token = p.needsUserToken ? await privateAccessToken(session) : undefined;
  const q = await oneclick.quote({ ...p.request, dry: true, deadline: new Date(Date.now() + p.deadlineMinutes * 60_000).toISOString() }, token);
  const paid = BigInt(q.quote.amountIn);
  const got = BigInt(q.quote.amountOut);
  const balance = input.kind === "add" ? null : await ownBalance(session, p.from.assetId);
  const payUsd = usdValue(p.from, paid);
  const getUsd = usdValue(p.to, got);
  return {
    kind: input.kind,
    youPay: { assetId: p.from.assetId, symbol: p.from.symbol, networkName: p.from.networkName, amount: paid.toString(), usd: payUsd },
    theyGet: { assetId: p.to.assetId, symbol: p.to.symbol, networkName: p.to.networkName, amount: got.toString(), usd: getUsd },
    fee: { usd: Math.max(0, payUsd - getUsd) },
    minimumReceived: q.quote.minAmountOut,
    secondsEstimate: q.quote.timeEstimate ?? null,
    enoughBalance: balance === null ? null : balance >= paid,
  };
}

type Row = { id: string; account_id: string; kind: TransferKind; status: TransferStatus; deposit_address: string | null; deposit_memo: string | null; details_sealed: string; team_request_id: string | null; expires_at: Date; created_at: Date };

async function toTransfer(row: Row): Promise<Transfer> {
  const d = open<Details>(row.details_sealed, aad(row.id, row.account_id));
  const [from, to] = await Promise.all([assetById(d.fromAssetId), assetById(d.toAssetId)]);
  return {
    id: row.id, kind: row.kind, status: row.status, createdAt: row.created_at, expiresAt: row.expires_at,
    fromAsset: light(from), toAsset: light(to), amountIn: d.amountIn, amountOut: d.amountOut, recipient: d.recipient, note: d.note,
    deposit: row.kind === "add" && row.deposit_address
      ? { address: row.deposit_address, memo: row.deposit_memo, network: from.networkName, minimum: d.depositMinimum } : null,
    intentToSign: row.status === "awaiting_signature" ? d.intent : null,
    resultHashes: d.resultHashes, teamRequestId: row.team_request_id,
  };
}

async function save(id: string, accountId: string, status: TransferStatus, details: Details, extra: { intentHash?: string } = {}) {
  await sql`UPDATE transfers SET status = ${status}, details_sealed = ${seal(details, aad(id, accountId))},
    intent_hash = COALESCE(${extra.intentHash ?? null}, intent_hash), updated_at = now() WHERE id = ${id}`;
}

export async function createTransfer(session: Session, input: TransferInput): Promise<Transfer> {
  requireEnabled();
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
    trackAddress: depositAddress, trackMemo: q.quote.depositMemo ?? null, resultHashes: [],
  };
  let status: TransferStatus;
  let address = depositAddress;
  let memo: string | null = q.quote.depositMemo ?? null;

  if (input.kind === "add") {
    const bridge = await oneclick.bridgeDepositAddress(depositAddress, p.from.depositChain!);
    address = bridge.address;
    memo = bridge.memo ?? memo;
    status = "awaiting_deposit";
  } else {
    const { intent } = await oneclick.generateIntent(depositAddress, session.accountId);
    const parsed = parseIntentMessage(intent.payload.message);
    if (!parsed || parsed.signer_id !== session.accountId) throw new HttpError(502, "upstream", "The payment network returned an unexpected transfer. Nothing was sent.");
    details.intent = intent.payload;
    status = "awaiting_signature";
  }

  let teamRequestId: string | null = null;
  if (input.teamRequestId) {
    const request = await approvedTeamRequest(session, input.teamRequestId);
    teamRequestId = request.id;
  }

  await sql.begin(async (tx) => {
    await tx`INSERT INTO transfers (id, account_id, kind, status, deposit_address, deposit_memo, details_sealed, team_request_id, expires_at)
      VALUES (${id}, ${session.accountId}, ${input.kind}, ${status}, ${address}, ${memo}, ${seal(details, aad(id, session.accountId))}, ${teamRequestId}, ${deadline})`;
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

  const claimed = await sql`UPDATE transfers SET status = 'processing', updated_at = now() WHERE id = ${id} AND status = 'awaiting_signature' RETURNING id`;
  if (claimed.length !== 1) throw conflict("This transfer was already sent.");
  try {
    const { intentHash } = await oneclick.submitIntent({
      standard: "nep413",
      payload: details.intent,
      public_key: signed.publicKey,
      signature: toIntentsSignature(signed.signature),
    });
    await save(row.id, row.account_id, "processing", details, { intentHash });
    if (row.team_request_id) await sql.begin((tx) => markTeamRequest(tx, row.team_request_id!, "submitting", { type: "human", id: session.accountId }));
    await sql.begin((tx) => audit(tx, null, { type: "human", id: session.accountId }, `transfer.${row.kind}.submitted`, id));
  } catch (error) {
    await save(row.id, row.account_id, "failed", details);
    throw error;
  }
  return refreshOne(session, id);
}

async function mine(session: Session, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Transfer not found.");
  const [row] = await sql<Row[]>`SELECT * FROM transfers WHERE id = ${id} AND account_id = ${session.accountId}`;
  if (!row) throw notFound("Transfer not found.");
  return row;
}

const END_STATE: Record<string, TransferStatus> = { SUCCESS: "success", REFUNDED: "refunded", FAILED: "failed" };

async function refreshOne(session: Session, id: string): Promise<Transfer> {
  const row = await mine(session, id);
  if (row.status === "awaiting_deposit" || row.status === "processing") {
    try {
      const details = open<Details>(row.details_sealed, aad(row.id, row.account_id));
      const s = await oneclick.status(details.trackAddress, details.trackMemo);
      const ended = END_STATE[s.status];
      if (ended) {
        details.resultHashes = s.swapDetails?.destinationChainTxHashes?.map((h) => h.hash) ?? details.resultHashes;
        await save(row.id, row.account_id, ended, details);
        if (row.team_request_id) {
          const outcome = ended === "success" ? "settled" : ended === "refunded" ? "approved" : "failed";
          await sql.begin((tx) => markTeamRequest(tx, row.team_request_id!, outcome, { type: "system", id: "intents" }));
        }
      } else if (s.status === "PROCESSING" && row.status === "awaiting_deposit") {
        await save(row.id, row.account_id, "processing", details);
      }
    } catch {
      // The network is briefly unreachable: keep the last known state.
    }
  }
  const fresh = await mine(session, id);
  if ((fresh.status === "awaiting_deposit" || fresh.status === "awaiting_signature") && fresh.expires_at < new Date()) {
    await sql`UPDATE transfers SET status = 'expired', updated_at = now() WHERE id = ${id} AND status IN ('awaiting_deposit', 'awaiting_signature')`;
    return toTransfer(await mine(session, id));
  }
  return toTransfer(fresh);
}

export const getTransfer = refreshOne;

export async function listTransfers(session: Session): Promise<Transfer[]> {
  const rows = await sql<Row[]>`SELECT * FROM transfers WHERE account_id = ${session.accountId} ORDER BY created_at DESC LIMIT 100`;
  return Promise.all(rows.map(toTransfer));
}

export async function cancelTransfer(session: Session, id: string): Promise<Transfer> {
  const row = await mine(session, id);
  if (!["awaiting_deposit", "awaiting_signature"].includes(row.status)) throw conflict("This transfer can no longer be cancelled.");
  await sql`UPDATE transfers SET status = 'cancelled', updated_at = now() WHERE id = ${id} AND status IN ('awaiting_deposit', 'awaiting_signature')`;
  return toTransfer(await mine(session, id));
}

// Pay an approved team request from the owner's private balance, out to the destination on Base.
export async function payTeamRequest(session: Session, requestId: string): Promise<Transfer> {
  const request = await approvedTeamRequest(session, requestId);
  const amount = (Number(request.amount) / 10 ** USDC_NEAR_TO_BASE.destination.decimals).toFixed(USDC_NEAR_TO_BASE.destination.decimals);
  return createTransfer(session, {
    kind: "withdraw",
    fromAssetId: USDC_NEAR_TO_BASE.source.assetId,
    toAssetId: USDC_NEAR_TO_BASE.destination.assetId,
    amount,
    recipient: request.recipient,
    note: request.memo,
    teamRequestId: request.id,
  });
}
