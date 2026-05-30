// Telegram reminder delivery primitives — no grammy dependency (structural sender).
// Lives in @m/shared so api + bot both resolve it via the working @m/* → packages/* symlink.

export class BotBlockedError extends Error {}
export class BotRateLimitError extends Error {
  constructor(public retryAfterSec: number) { super("rate limited"); }
}

/** Minimal structural sender: anything with sendMessage(chatId, text). */
export interface TelegramSender {
  sendMessage(chatId: number, text: string): Promise<unknown>;
}

/** Send one reminder. Maps Telegram errors (403 blocked, 429 rate-limit) to typed errors. */
export async function sendReminder(sender: TelegramSender, telegramId: number, text: string): Promise<"sent"> {
  try {
    await sender.sendMessage(telegramId, text);
    return "sent";
  } catch (e: any) {
    if (e?.error_code === 403) throw new BotBlockedError(e.description ?? "blocked");
    if (e?.error_code === 429) throw new BotRateLimitError(e?.parameters?.retry_after ?? 1);
    throw e;
  }
}

/**
 * Production sender using the Telegram Bot API over HTTP (Node 22 global fetch — no grammy).
 * Throws Telegram-shaped errors ({error_code, parameters}) so sendReminder maps them.
 */
export function telegramFetchSender(botToken: string): TelegramSender {
  return {
    async sendMessage(chatId: number, text: string): Promise<unknown> {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!body?.ok) {
        throw { error_code: body?.error_code ?? res.status, description: body?.description, parameters: body?.parameters };
      }
      return body;
    },
  };
}
