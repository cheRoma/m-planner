import { describe, it, expect, vi } from "vitest";
import { ReminderDelivery } from "./reminder-delivery";
import { BotBlockedError, BotRateLimitError } from "../../../bot/src/bot";

function fakePrisma() {
  return {
    checklistItem: { findUnique: vi.fn(async () => ({ id: "ci1", title: "ЗАГС", ackAt: null, reminderStatus: null, project: { owner: { telegramId: 42n } } })) },
    checklistItem_update: vi.fn(),
  } as any;
}

describe("ReminderDelivery.deliver", () => {
  it("marks sent on success", async () => {
    const prisma = fakePrisma();
    prisma.checklistItem.update = vi.fn(async () => ({}));
    const send = vi.fn(async () => "sent" as const);
    const d = new ReminderDelivery(prisma, send as any);
    const res = await d.deliver("ci1");
    expect(res).toBe("sent");
    expect(prisma.checklistItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { reminderStatus: "sent" } }));
  });

  it("marks blocked and does NOT retry when bot is blocked", async () => {
    const prisma = fakePrisma();
    prisma.checklistItem.update = vi.fn(async () => ({}));
    const send = vi.fn(async () => { throw new BotBlockedError("blocked"); });
    const d = new ReminderDelivery(prisma, send as any);
    const res = await d.deliver("ci1");
    expect(res).toBe("blocked");
    expect(send).toHaveBeenCalledTimes(1); // no retry
  });

  it("skips delivery if item already acknowledged (dedup, §12.9)", async () => {
    const prisma = fakePrisma();
    prisma.checklistItem.findUnique = vi.fn(async () => ({ id: "ci1", ackAt: new Date(), project: { owner: { telegramId: 42n } } }));
    prisma.checklistItem.update = vi.fn(async () => ({}));
    const send = vi.fn();
    const d = new ReminderDelivery(prisma, send as any);
    const res = await d.deliver("ci1");
    expect(res).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("propagates BotRateLimitError so the queue can retry with backoff", async () => {
    const prisma = fakePrisma();
    prisma.checklistItem.update = vi.fn(async () => ({}));
    const send = vi.fn(async () => { throw new BotRateLimitError(5); });
    const d = new ReminderDelivery(prisma, send as any);
    await expect(d.deliver("ci1")).rejects.toBeInstanceOf(BotRateLimitError);
  });
});
