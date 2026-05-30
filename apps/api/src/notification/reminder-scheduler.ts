import { Injectable, Inject } from "@nestjs/common";
import type { Queue } from "bullmq";
import type { Clock } from "../invite/invite.service";

export interface ReminderJob { checklistItemId: string; }

@Injectable()
export class ReminderScheduler {
  constructor(@Inject("REMINDER_QUEUE") private readonly queue: Queue<ReminderJob>, @Inject("CLOCK") private readonly clock: Clock) {}

  async schedule(item: { id: string; reminderAt: Date }): Promise<void> {
    const delay = Math.max(0, item.reminderAt.getTime() - this.clock.nowMs());
    await this.queue.add(
      "reminder",
      { checklistItemId: item.id },
      { delay, attempts: 5, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: true },
    );
  }
}
