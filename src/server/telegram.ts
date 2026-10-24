import { randomBytes } from "node:crypto";
import { isNetwork } from "@/protocol/networks";
import type { Session } from "./auth";
import { config } from "./config";
import { sql } from "./db";
import { badRequest } from "./errors";
import { telegramApi, telegramEnabled, telegramWebhookSecret } from "./notify";

let webhookReady: Promise<void> | null = null;

// Points the bot at this site once per server instance. Safe to repeat.
function ensureWebhook() {
  webhookReady ??= telegramApi("setWebhook", {
    url: `${config.siteUrl}/api/telegram/webhook`,
    secret_token: telegramWebhookSecret(),
    allowed_updates: ["message"],
  }).then((result) => {
    if (!result?.ok) {
      webhookReady = null;
      throw new Error(`Telegram setWebhook failed: ${result?.description ?? "no response"}`);
    }
  });
  return webhookReady;
}

export async function telegramStatus(session: Session) {
  if (!telegramEnabled()) return { available: false, linked: false };
  const [row] = await sql`SELECT 1 FROM telegram_links WHERE account_id = ${session.accountId} AND network = ${session.network}`;
  return { available: true, linked: Boolean(row) };
}

// A one-time code the person sends to the bot by opening a t.me link. Valid for 10 minutes.
export async function createTelegramLink(session: Session) {
  if (!telegramEnabled()) throw badRequest("Telegram alerts are not set up on this site yet.");
  await ensureWebhook();
  const code = randomBytes(18).toString("base64url");
  await sql`DELETE FROM telegram_link_codes WHERE expires_at < now() OR account_id = ${session.accountId}`;
  await sql`INSERT INTO telegram_link_codes (code, account_id, network, expires_at) VALUES (${code}, ${session.accountId}, ${session.network}, ${new Date(Date.now() + 10 * 60 * 1000)})`;
  return { url: `https://t.me/${config.telegramBotUsername}?start=${code}` };
}

export async function unlinkTelegram(session: Session) {
  await sql`DELETE FROM telegram_links WHERE account_id = ${session.accountId} AND network = ${session.network}`;
}

type Update = { message?: { chat?: { id?: number; type?: string }; text?: string } };

export async function handleTelegramUpdate(update: Update) {
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  if (!chatId || update.message?.chat?.type !== "private") return;
  const match = text.match(/^\/start\s+([A-Za-z0-9_-]{10,64})$/);
  if (!match) {
    await telegramApi("sendMessage", { chat_id: chatId, text: "Open Scrim, go to Team, and tap “Get alerts on Telegram” to connect this chat." });
    return;
  }
  const [code] = await sql<{ account_id: string; network: string }[]>`
    DELETE FROM telegram_link_codes WHERE code = ${match[1]} AND expires_at > now() RETURNING account_id, network`;
  if (!code || !isNetwork(code.network)) {
    await telegramApi("sendMessage", { chat_id: chatId, text: "That link has expired. Open Scrim and tap “Get alerts on Telegram” again." });
    return;
  }
  await sql`
    INSERT INTO telegram_links (account_id, network, chat_id) VALUES (${code.account_id}, ${code.network}, ${String(chatId)})
    ON CONFLICT (account_id, network) DO UPDATE SET chat_id = EXCLUDED.chat_id, created_at = now()`;
  await telegramApi("sendMessage", { chat_id: chatId, text: `Connected to ${code.account_id} on ${code.network}. You'll get a message when a payment needs your approval.` });
}
