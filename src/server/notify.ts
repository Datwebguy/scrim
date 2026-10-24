import { createHash, createHmac } from "node:crypto";
import { after } from "next/server";
import { formatAmount } from "@/protocol/amount";
import { corridorFor } from "@/protocol/corridor";
import { isNetwork, type Network } from "@/protocol/networks";
import { config } from "./config";
import { sql } from "./db";
import { safePublicUrl, safeRequest } from "./safe-fetch";
import { open } from "./secrets";

export type PaymentEvent = "payment.requested" | "payment.policy_rejected" | "payment.approved" | "payment.cancelled" | "payment.submitting" | "payment.settled" | "payment.failed";

// Runs after the response is sent, so a slow webhook or Telegram never delays the person or agent.
// Outside a request (scripts, tests) it simply runs in the background.
export function emitPaymentEvent(requestId: string, event: PaymentEvent) {
  const job = () => deliver(requestId, event).catch((error) => console.error("[notify]", event, requestId, error));
  try {
    after(job);
  } catch {
    void job();
  }
}

type EventRow = {
  id: string; treasury_id: string; treasury_name: string; network: string; owner_account_id: string; status: string;
  recipient: string; amount: string; memo: string; created_by_type: string; created_by_id: string;
  agent_id: string | null; agent_name: string | null; webhook_url: string | null; webhook_secret: string | null;
};

export async function deliver(requestId: string, event: PaymentEvent) {
  const [row] = await sql<EventRow[]>`
    SELECT p.id, p.treasury_id, t.name AS treasury_name, t.network, t.owner_account_id, p.status, p.recipient, p.amount::text AS amount, p.memo,
           p.created_by_type, p.created_by_id, a.id AS agent_id, a.name AS agent_name, a.webhook_url, a.webhook_secret
    FROM payment_requests p JOIN treasuries t ON t.id = p.treasury_id LEFT JOIN agents a ON a.id = p.agent_id
    WHERE p.id = ${requestId}`;
  if (!row || !isNetwork(row.network)) return;
  await Promise.allSettled([agentWebhook(row, event), telegramAlerts(row, row.network, event)]);
}

/* ── Agent webhooks ──────────────────────────────────────────────────────── */

function webhookPayload(row: EventRow, event: PaymentEvent, at = new Date()) {
  const unit = corridorFor(row.network as Network);
  return {
    type: event,
    createdAt: at.toISOString(),
    data: {
      payment: {
        id: row.id,
        status: row.status,
        recipient: row.recipient,
        amount: row.amount,
        amountFormatted: `${formatAmount(BigInt(row.amount), unit.decimals)} ${unit.symbol}`,
        memo: row.memo,
        network: row.network,
      },
    },
  };
}

// Header format: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>"> using the agent's signing secret.
export function signWebhook(secret: string, body: string, timestamp: number) {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

async function agentWebhook(row: EventRow, event: PaymentEvent) {
  if (!row.agent_id || !row.webhook_url || !row.webhook_secret) return;
  if (!safePublicUrl(row.webhook_url)) {
    await sql`INSERT INTO webhook_deliveries (agent_id, request_id, event, status_code, ok) VALUES (${row.agent_id}, ${row.id}, ${event}, NULL, false)`;
    return;
  }
  const secret = open<string>(row.webhook_secret, `agent-webhook:${row.agent_id}`);
  const body = JSON.stringify(webhookPayload(row, event));
  const response = await safeRequest(row.webhook_url, {
    method: "POST",
    body,
    timeoutMs: 5000,
    maxBytes: 1024,
    headers: { "content-type": "application/json", "user-agent": "Scrim-Webhooks/1", "scrim-event": event, "scrim-signature": signWebhook(secret, body, Math.floor(Date.now() / 1000)) },
  });
  const status = response?.status ?? null;
  await sql`INSERT INTO webhook_deliveries (agent_id, request_id, event, status_code, ok) VALUES (${row.agent_id}, ${row.id}, ${event}, ${status}, ${status !== null && status >= 200 && status < 300})`;
}

/* ── Telegram alerts ─────────────────────────────────────────────────────── */

export const telegramEnabled = () => Boolean(config.telegramBotToken && config.telegramBotUsername);

// Telegram sends this back on every webhook call, so only Telegram can reach our webhook.
export function telegramWebhookSecret() {
  return createHash("sha256").update(`scrim-telegram:${process.env.SCRIM_SECRET_KEY ?? "development"}:${config.telegramBotToken ?? ""}`).digest("hex").slice(0, 48);
}

export async function telegramApi(method: string, payload: Record<string, unknown>) {
  if (!config.telegramBotToken) return null;
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  return response.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function telegramAlerts(row: EventRow, network: Network, event: PaymentEvent) {
  if (!telegramEnabled()) return;
  const unit = corridorFor(network);
  const amount = `${formatAmount(BigInt(row.amount), unit.decimals)} ${unit.symbol}`;
  const who = row.created_by_type === "agent" ? `Agent <b>${escapeHtml(row.agent_name ?? "agent")}</b>` : `<b>${escapeHtml(row.created_by_id)}</b>`;
  const link = `${config.siteUrl}/app/team/${row.treasury_id}`;
  const team = escapeHtml(row.treasury_name);
  const to = `<code>${escapeHtml(row.recipient)}</code>`;

  let text: string | null = null;
  let everyone = false;
  if (event === "payment.requested") {
    text = `🟠 ${who} asks to pay <b>${amount}</b> to ${to}\nTeam: ${team}\n\nReview and approve: ${link}`;
    everyone = true;
  } else if (event === "payment.policy_rejected") text = `⛔ ${who} tried to pay <b>${amount}</b> to ${to}, outside its limits. It was stopped.\nTeam: ${team}\n${link}`;
  else if (event === "payment.approved") text = `✅ Approved: <b>${amount}</b> to ${to}. Ready to pay.\nTeam: ${team}\n${link}`;
  else if (event === "payment.settled") text = `💸 Paid: <b>${amount}</b> to ${to}.\nTeam: ${team}`;
  else if (event === "payment.failed") text = `⚠️ Payment failed: <b>${amount}</b> to ${to}.\nTeam: ${team}\n${link}`;
  if (!text) return;

  const accounts = everyone
    ? (await sql<{ account_id: string }[]>`SELECT account_id FROM treasury_signers WHERE treasury_id = ${row.treasury_id}`).map((r) => r.account_id)
    : [row.owner_account_id];
  if (accounts.length === 0) return;
  const chats = await sql<{ chat_id: string }[]>`SELECT chat_id FROM telegram_links WHERE network = ${network} AND account_id IN ${sql(accounts)}`;
  await Promise.allSettled(chats.map((c) => telegramApi("sendMessage", { chat_id: c.chat_id, text, parse_mode: "HTML", disable_web_page_preview: true })));
}
