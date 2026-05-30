import { Module, OnModuleInit, OnModuleDestroy, Inject } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { prisma } from "@m/db";
import { ReminderScheduler } from "./reminder-scheduler";
import { ReminderDelivery, type SendFn } from "./reminder-delivery";
import { DeadlinesService } from "./deadlines.service";
import { NotificationController } from "./notification.controller";
import { sendReminder, makeBot } from "@m/bot";

const REMINDER_QUEUE = "reminders";
function conn() { const u = new URL(process.env.REDIS_URL ?? "redis://localhost:6379"); return { host: u.hostname, port: Number(u.port || 6379) }; }

@Module({
  controllers: [NotificationController],
  providers: [
    ReminderScheduler, ReminderDelivery, DeadlinesService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "CLOCK", useValue: { nowMs: () => Date.now() } },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
    { provide: "REMINDER_QUEUE", useFactory: () => new Queue(REMINDER_QUEUE, { connection: conn() }) },
    { provide: "SEND_FN", useFactory: (): SendFn => {
        // Guard: with an empty token, do NOT construct a real Bot (and never hit Telegram
        // during tests). A no-op send keeps AppModule bootstrap green for e2e suites.
        const token = process.env.BOT_TOKEN ?? "";
        if (!token) return async () => "sent" as const;
        const api = makeBot(token).api;
        return (telegramId: number, text: string) => sendReminder(api, telegramId, text);
      } },
  ],
  exports: [ReminderScheduler, "REMINDER_QUEUE"],
})
export class NotificationModule implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  constructor(@Inject("REMINDER_QUEUE") private readonly queue: Queue, private readonly delivery: ReminderDelivery) {}
  onModuleInit() {
    this.worker = new Worker(REMINDER_QUEUE, async (job) => {
      const outcome = await this.delivery.deliver(job.data.checklistItemId);
      if (outcome === "failed") throw new Error("delivery failed"); // triggers BullMQ retry/backoff
    }, { connection: conn() });
  }
  async onModuleDestroy() { await this.worker?.close(); await this.queue.close(); }
}
