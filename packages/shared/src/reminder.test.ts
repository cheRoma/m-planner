import { describe, it, expect, vi } from "vitest";
import { sendReminder, BotBlockedError, BotRateLimitError } from "./reminder";

describe("sendReminder", () => {
  it("returns sent on success", async () => {
    const sender = { sendMessage: vi.fn(async () => ({})) };
    const res = await sendReminder(sender, 42, "Подать заявление в ЗАГС");
    expect(res).toBe("sent");
    expect(sender.sendMessage).toHaveBeenCalledWith(42, "Подать заявление в ЗАГС");
  });

  it("maps 403 (blocked) to BotBlockedError", async () => {
    const sender = { sendMessage: vi.fn(async () => { throw { error_code: 403, description: "bot was blocked by the user" }; }) };
    await expect(sendReminder(sender, 42, "x")).rejects.toBeInstanceOf(BotBlockedError);
  });

  it("maps 429 to BotRateLimitError with retryAfter", async () => {
    const sender = { sendMessage: vi.fn(async () => { throw { error_code: 429, parameters: { retry_after: 5 } }; }) };
    await expect(sendReminder(sender, 42, "x")).rejects.toMatchObject({ retryAfterSec: 5 });
  });
});
