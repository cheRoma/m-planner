import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { BotBlockedError, BotRateLimitError } from "@m/shared";

export type DeliveryOutcome = "sent" | "blocked" | "failed" | "skipped";
export type SendFn = (telegramId: number, text: string) => Promise<"sent">;

@Injectable()
export class ReminderDelivery {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient, @Inject("SEND_FN") private readonly send: SendFn) {}

  async deliver(checklistItemId: string): Promise<DeliveryOutcome> {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: checklistItemId },
      include: { project: { include: { owner: true } } },
    });
    if (!item) return "failed";
    if (item.ackAt) return "skipped"; // §12.9: already acknowledged → no push

    const telegramId = Number((item as any).project.owner.telegramId);
    try {
      await this.send(telegramId, `Напоминание: ${item.title}`);
      await this.prisma.checklistItem.update({ where: { id: checklistItemId }, data: { reminderStatus: "sent" } });
      return "sent";
    } catch (e) {
      if (e instanceof BotBlockedError) {
        await this.prisma.checklistItem.update({ where: { id: checklistItemId }, data: { reminderStatus: "blocked" } });
        return "blocked"; // do not retry — user blocked the bot; fallback covers it (§11.5)
      }
      if (e instanceof BotRateLimitError) {
        await this.prisma.checklistItem.update({ where: { id: checklistItemId }, data: { reminderStatus: "failed" } });
        throw e; // let the queue retry with backoff using retryAfterSec
      }
      await this.prisma.checklistItem.update({ where: { id: checklistItemId }, data: { reminderStatus: "failed" } });
      throw e;
    }
  }
}
