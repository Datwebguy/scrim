import { randomUUID } from "node:crypto";
import { formatAmount, parseAmount } from "@/protocol/amount";
import { atLeastAmount, signProof, type ProofClaim, type ProofPayload } from "@/protocol/proof";
import { audit } from "./audit";
import type { Session } from "./auth";
import { assetById } from "./assets";
import { overview } from "./balances";
import { sql } from "./db";
import { PRIVATE_MONEY_MAINNET_ONLY } from "@/protocol/networks";
import { badRequest, conflict, HttpError, notFound } from "./errors";
import { open, proofSigningKey, seal } from "./secrets";
import { getTransfer } from "./transfers";

export type ProofInput = {
  kind: "balance_at_least" | "payment";
  reader: string;
  days: number;
  holder?: string;
  // balance_at_least
  unit?: "asset" | "usd";
  assetId?: string;
  amount?: string;
  // payment
  transferId?: string;
  revealExact?: boolean;
};

export type ProofRecord = { id: string; kind: string; reader: string; summary: ProofClaim; issuedAt: string; expiresAt: string; revoked: boolean; token: string };

const aad = (id: string, account: string) => `proof:${id}:${account}`;
const DAYS = new Set([1, 7, 30]);

export async function createProof(session: Session, input: ProofInput): Promise<ProofRecord> {
  if (session.network !== "mainnet") throw new HttpError(503, "mainnet_only", PRIVATE_MONEY_MAINNET_ONLY);
  const reader = String(input.reader ?? "").trim();
  if (reader.length < 2 || reader.length > 80) throw badRequest("Say who this proof is for (2 to 80 characters).");
  if (!DAYS.has(input.days)) throw badRequest("Choose 1, 7 or 30 days.");
  const holder = (input.holder ?? "").trim().slice(0, 80) || null;

  let claim: ProofClaim;
  if (input.kind === "balance_at_least") {
    const o = await overview(session);
    if (o.status !== "active") throw conflict("Unlock your private balance first.");
    const parse = (decimals: number) => {
      try {
        const value = parseAmount(String(input.amount ?? ""), decimals);
        if (value <= 0n) throw new RangeError("Enter an amount greater than zero.");
        return value;
      } catch (e) {
        throw badRequest((e as Error).message);
      }
    };
    if (input.unit === "usd") {
      const wanted = parse(2);
      if (BigInt(Math.floor(o.totalUsd * 100)) < wanted) throw conflict("Your private balance is below that amount, so it can't be proven.");
      claim = { type: "balance_at_least", unit: "usd", symbol: null, amount: formatAmount(wanted, 2, 0) };
    } else {
      const asset = await assetById(String(input.assetId ?? ""));
      const needed = parse(asset.decimals);
      const held = BigInt(o.holdings.find((h) => h.assetId === asset.assetId)?.amount ?? "0");
      if (held < needed) throw conflict(`You hold less than that in ${asset.symbol}, so it can't be proven.`);
      claim = { type: "balance_at_least", unit: "asset", symbol: asset.symbol, amount: formatAmount(needed, asset.decimals, 0) };
    }
  } else if (input.kind === "payment") {
    const transfer = await getTransfer(session, String(input.transferId ?? ""));
    if (!["send", "withdraw"].includes(transfer.kind)) throw badRequest("Only payments you sent can be proven.");
    if (transfer.status !== "success") throw conflict("That payment hasn't completed yet.");
    const exact = input.revealExact !== false;
    const paid = BigInt(transfer.amountOut);
    claim = {
      type: "payment", amount: formatAmount(exact ? paid : atLeastAmount(paid), transfer.toAsset.decimals, exact ? 2 : 0), symbol: transfer.toAsset.symbol,
      chainName: transfer.toAsset.chainName, exact, paidAt: transfer.createdAt.toISOString(),
      ...(transfer.recipient ? { to: transfer.recipient } : {}),
    };
  } else {
    throw badRequest("Choose what to prove.");
  }

  const id = randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + input.days * 86_400_000);
  const payload: ProofPayload = { v: 1, id, reader, account: session.accountId, holder, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), claim };
  const token = signProof(payload, proofSigningKey().secret);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO proofs (id, account_id, network, kind, details_sealed, expires_at) VALUES (${id}, ${session.accountId}, ${session.network}, ${input.kind}, ${seal({ payload, token }, aad(id, session.accountId))}, ${expiresAt})`;
    await audit(tx, null, { type: "human", id: session.accountId }, "proof.created", id, { kind: input.kind, days: input.days });
  });
  return { id, kind: input.kind, reader, summary: claim, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt, revoked: false, token };
}

export async function listProofs(session: Session): Promise<ProofRecord[]> {
  const rows = await sql<{ id: string; kind: string; details_sealed: string; revoked_at: Date | null }[]>`
    SELECT id, kind, details_sealed, revoked_at FROM proofs WHERE account_id = ${session.accountId} AND network = ${session.network} ORDER BY created_at DESC LIMIT 100`;
  return rows.map((r) => {
    const { payload, token } = open<{ payload: ProofPayload; token: string }>(r.details_sealed, aad(r.id, session.accountId));
    return { id: r.id, kind: r.kind, reader: payload.reader, summary: payload.claim, issuedAt: payload.issuedAt, expiresAt: payload.expiresAt, revoked: Boolean(r.revoked_at), token };
  });
}

export async function revokeProof(session: Session, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Proof not found.");
  const rows = await sql`UPDATE proofs SET revoked_at = COALESCE(revoked_at, now()) WHERE id = ${id} AND account_id = ${session.accountId} AND network = ${session.network} RETURNING id`;
  if (rows.length === 0) throw notFound("Proof not found.");
  await sql.begin((tx) => audit(tx, null, { type: "human", id: session.accountId }, "proof.revoked", id));
}

// Public: tells a reader whether the owner has withdrawn a proof. Reveals nothing but the ID's state.
export async function proofState(id: string): Promise<{ revoked: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { revoked: false };
  const [row] = await sql<{ revoked_at: Date | null }[]>`SELECT revoked_at FROM proofs WHERE id = ${id}`;
  return { revoked: Boolean(row?.revoked_at) };
}
