import { requireSession, route } from "@/server/http";
import { createTelegramLink, telegramStatus, unlinkTelegram } from "@/server/telegram";

export const GET = route(async () => telegramStatus(await requireSession()));
export const POST = route(async () => createTelegramLink(await requireSession()));
export const DELETE = route(async () => {
  await unlinkTelegram(await requireSession());
  return { ok: true };
});
