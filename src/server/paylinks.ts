import { randomBytes } from "node:crypto";
import { formatAmount, parseAmount } from "@/protocol/amount";
import { audit } from "./audit";
import type { Session } from "./auth";
import { assetById } from "./assets";
import { sql } from "./db";
import { badRequest, notFound } from "./errors";
import { open, seal } from "./secrets";

const ALPHABET = "abcdefghjkmnpqrstvwxyz23456789"; // no look-alike characters
const newCode = () => Array.from(randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join("");
const aad = (code: string, account: string) => `paylink:${code}:${account}`;

export type PayLink = {
  code: string; assetId: string; symbol: string; networkName: string; amount: string; display: string;
  note: string; status: "open" | "paid" | "closed" | "expired"; expiresAt: Date; createdAt: Date;
};

type Row = { id: string; account_id: string; asset_id: string; amount: string; details_sealed: string; status: "open" | "paid" | "closed"; expires_at: Date; created_at: Date };

async function toLink(row: Row): Promise<PayLink> {
  const asset = await assetById(row.asset_id);
  const { note } = open<{ note: string }>(row.details_sealed, aad(row.id, row.account_id));
  return {
    code: row.id, assetId: asset.assetId, symbol: asset.symbol, networkName: asset.networkName, amount: row.amount,
    display: formatAmount(BigInt(row.amount), asset.decimals, 2), note,
    status: row.status === "open" && row.expires_at < new Date() ? "expired" : row.status, expiresAt: row.expires_at, createdAt: row.created_at,
  };
}

export async function createPayLink(session: Session, input: { assetId: string; amount: string; note?: string; days?: number }): Promise<PayLink> {
  const asset = await assetById(input.assetId);
  let amount: bigint;
  try {
    amount = parseAmount(String(input.amount ?? ""), asset.decimals);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (amount <= 0n) throw badRequest("Enter an amount greater than zero.");
  const note = (input.note ?? "").trim();
  if (note.length > 140) throw badRequest("Keep the note under 140 characters.");
  const days = [1, 7, 30].includes(Number(input.days)) ? Number(input.days) : 7;
  const code = newCode();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO pay_links (id, account_id, asset_id, amount, details_sealed, expires_at)
      VALUES (${code}, ${session.accountId}, ${asset.assetId}, ${amount.toString()}, ${seal({ note }, aad(code, session.accountId))}, now() + make_interval(days => ${days}))`;
    await audit(tx, null, { type: "human", id: session.accountId }, "link.created", code);
  });
  return toLink((await sql<Row[]>`SELECT * FROM pay_links WHERE id = ${code}`)[0]);
}

export async function listPayLinks(session: Session): Promise<PayLink[]> {
  const rows = await sql<Row[]>`SELECT * FROM pay_links WHERE account_id = ${session.accountId} ORDER BY created_at DESC LIMIT 100`;
  return Promise.all(rows.map(toLink));
}

export async function closePayLink(session: Session, code: string) {
  const rows = await sql`UPDATE pay_links SET status = 'closed' WHERE id = ${code} AND account_id = ${session.accountId} AND status = 'open' RETURNING id`;
  if (rows.length === 0) throw notFound("Link not found, or it is already finished.");
}

// Public: what a payer sees. The requester is shown by account name only.
export async function publicLink(code: string): Promise<PayLink & { to: string }> {
  if (!/^[a-z2-9]{10}$/.test(code)) throw notFound("This payment link doesn't exist.");
  const [row] = await sql<Row[]>`SELECT * FROM pay_links WHERE id = ${code}`;
  if (!row) throw notFound("This payment link doesn't exist.");
  const link = await toLink(row);
  const to = row.account_id.length > 24 ? `${row.account_id.slice(0, 6)}…${row.account_id.slice(-4)}` : row.account_id;
  return { ...link, to };
}

export async function linkRow(code: string) {
  const [row] = await sql<Row[]>`SELECT * FROM pay_links WHERE id = ${code}`;
  if (!row) throw notFound("This payment link doesn't exist.");
  const link = await toLink(row);
  if (link.status !== "open") throw badRequest(link.status === "paid" ? "This link was already paid." : "This link is no longer open.");
  return { id: row.id, accountId: row.account_id, assetId: row.asset_id, amount: row.amount, note: link.note, expiresAt: row.expires_at };
}
