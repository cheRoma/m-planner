import { describe, it, expect, vi } from "vitest";
import { sendReminder, BotBlockedError, BotRateLimitError } from "./bot";

describe("sendReminder", () => {
  it("returns sent on success", async () => {
    const api = { sendMessage: vi.fn(async () => ({})) } as any;
    const res = await sendReminder(api, 42, "Подать заявление в ЗАГС");
    expect(res).toBe("sent");
  });

  it("maps 403 (blocked) to BotBlockedError", async () => {
    const api = { sendMessage: vi.fn(async () => { throw { error_code: 403, description: "bot was blocked by the user" }; }) } as any;
    await expect(sendReminder(api, 42, "x")).rejects.toBeInstanceOf(BotBlockedError);
  });

  it("maps 429 to BotRateLimitError with retryAfter", async () => {
    const api = { sendMessage: vi.fn(async () => { throw { error_code: 429, parameters: { retry_after: 5 } }; }) } as any;
    await expect(sendReminder(api, 42, "x")).rejects.toMatchObject({ retryAfterSec: 5 });
  });
});
