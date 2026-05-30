import { Bot, type Api } from "grammy";

export class BotBlockedError extends Error {}
export class BotRateLimitError extends Error { constructor(public retryAfterSec: number) { super("rate limited"); } }

/** Send one reminder. Maps Telegram errors to typed errors the delivery worker handles. */
export async function sendReminder(api: Pick<Api, "sendMessage">, telegramId: number, text: string): Promise<"sent"> {
  try {
    await api.sendMessage(telegramId, text);
    return "sent";
  } catch (e: any) {
    if (e?.error_code === 403) throw new BotBlockedError(e.description ?? "blocked");
    if (e?.error_code === 429) throw new BotRateLimitError(e?.parameters?.retry_after ?? 1);
    throw e;
  }
}

export function makeBot(token: string): Bot {
  const bot = new Bot(token);
  bot.command("start", async (ctx) => {
    // deep-link payload: preset_<...> | invite_<token>  (handled by Mini App on open)
    await ctx.reply("Открой Mini App, чтобы рассчитать смету или принять приглашение.");
  });
  return bot;
}
