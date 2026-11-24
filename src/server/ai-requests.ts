// Payments an AI app prepares for a person, the way agent wallets like PayBox do it: the app files a request,
// the person reviews it in Scrim and confirms with their own wallet (or declines), and the app reads where it
// stands. A request carries no money and no signature; it is only what to fill in on Scrim's own screen.
import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import type { Session } from "./auth";
import { sql } from "./db";
import { badRequest, notFound } from "./errors";

const TTL_MS = 24 * 60 * 60 * 1000;

export type AiRequestKind = "swap" | "send" | "withdraw";
export type AiRequestDetails = { mode: "swap" | "person" | "address"; from: string; to?: string; amount: string; recipient?: string; note?: string; summary: string };
type Row = { id: string; account_id: string; network: string; client_id: string | null; app_name: string; kind: AiRequestKind; details: AiRequestDetails; status: "pending" | "declined"; transfer_id: string | null; created_at: Date; expires_at: Date; transfer_status: string | null };

// What the person and the app see: waiting for the person, on its way, done, or ended without paying.
export type AiRequestState = "waiting_for_you" | "in_progress" | "done" | "failed" | "declined" | "expired";

function stateOf(row: Row): AiRequestState {
  if (row.status === "declined") return "declined";
  switch (row.transfer_status) {
    case "success": return "done";
    case "processing": case "awaiting_deposit": return "in_progress";
    case "failed": case "refunded": return "failed";
  }
  return row.expires_at.getTime() < Date.now() ? "expired" : "waiting_for_you";
}

const SELECT = sql`
  SELECT r.*, t.status AS transfer_status FROM ai_requests r LEFT JOIN transfers t ON t.id = r.transfer_id`;

function view(row: Row) {
  return { id: row.id, app: row.app_name, kind: row.kind, details: row.details, state: stateOf(row), createdAt: row.created_at, expiresAt: row.expires_at };
}

export async function createAiRequest(session: Session, app: { clientId?: string; name: string }, kind: AiRequestKind, details: AiRequestDetails) {
  const id = randomUUID();
  await sql`
    INSERT INTO ai_requests (id, account_id, network, client_id, app_name, kind, details, expires_at)
    VALUES (${id}, ${session.accountId}, ${session.network}, ${app.clientId ?? null}, ${app.name}, ${kind}, ${sql.json(details as never)}, ${new Date(Date.now() + TTL_MS)})`;
  await audit(sql, null, { type: "human", id: session.accountId }, "ai_request.created", id, { kind, app: app.name });
  return id;
}

async function own(session: Session, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Request not found.");
  const [row] = await sql<Row[]>`${SELECT} WHERE r.id = ${id} AND r.account_id = ${session.accountId} AND r.network = ${session.network}`;
  if (!row) throw notFound("Request not found.");
  return row;
}

// For the person, in Scrim.
export async function getAiRequest(session: Session, id: string) {
  return view(await own(session, id));
}

export async function waitingAiRequests(session: Session) {
  const rows = await sql<Row[]>`${SELECT}
    WHERE r.account_id = ${session.accountId} AND r.network = ${session.network} AND r.status = 'pending' AND r.expires_at > now()
    ORDER BY r.created_at DESC LIMIT 10`;
  return rows.map(view).filter((r) => r.state === "waiting_for_you");
}

export async function declineAiRequest(session: Session, id: string) {
  const row = await own(session, id);
  if (stateOf(row) !== "waiting_for_you") throw badRequest("This request isn't waiting any more.");
  await sql`UPDATE ai_requests SET status = 'declined' WHERE id = ${row.id}`;
  await audit(sql, null, { type: "human", id: session.accountId }, "ai_request.declined", row.id);
}

// When the person gets a price on the request's screen, the transfer it creates belongs to the request.
// Going back and pricing again moves the request to the newer transfer.
export async function attachTransfer(session: Session, id: string, transferId: string) {
  const row = await own(session, id);
  const state = stateOf(row);
  if (state !== "waiting_for_you") throw badRequest(state === "expired" ? "This request expired. Ask your AI app to prepare it again." : "This request isn't waiting any more.");
  await sql`UPDATE ai_requests SET transfer_id = ${transferId} WHERE id = ${row.id}`;
}

// For the AI app: only its own requests, for this account.
export async function aiRequestForApp(session: Session & { clientId?: string }, id: string) {
  const row = await own(session, id);
  if (row.client_id !== (session.clientId ?? null)) throw notFound("Request not found.");
  const v = view(row);
  return { request_id: v.id, kind: v.kind, summary: v.details.summary, state: v.state, expires_at: v.expiresAt };
}
