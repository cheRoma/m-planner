import { Bot } from "grammy";
export { sendReminder, telegramFetchSender, BotBlockedError, BotRateLimitError, type TelegramSender } from "@m/shared";

export function makeBot(token: string): Bot {
  const bot = new Bot(token);
  bot.command("start", async (ctx) => {
    // deep-link payload: preset_<...> | invite_<token>  (handled by Mini App on open)
    await ctx.reply("Открой Mini App, чтобы рассчитать смету или принять приглашение.");
  });
  return bot;
}
