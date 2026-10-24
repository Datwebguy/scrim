import { NextResponse, type NextRequest } from "next/server";
import { telegramEnabled, telegramWebhookSecret } from "@/server/notify";
import { handleTelegramUpdate } from "@/server/telegram";

// Called by Telegram only: every call carries the secret we gave Telegram when setting the webhook.
export async function POST(request: NextRequest) {
  if (!telegramEnabled() || request.headers.get("x-telegram-bot-api-secret-token") !== telegramWebhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    await handleTelegramUpdate(await request.json());
  } catch (error) {
    console.error("[telegram]", error);
  }
  return NextResponse.json({ ok: true });
}
