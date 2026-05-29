# План 4 — Напоминания + комплаенс (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Замкнуть ядро обещания «не потерять дату»: надёжная доставка напоминаний через бот (ретраи, 429, «бот заблокирован»), видимый fallback в Mini App без дублей, согласие и удаление по 152-ФЗ, обновление seed-цен — и закрыть 3 критичных integration-теста.

**Architecture:** `apps/bot` (grammY) — доставка. Notification-контекст ставит `checklist_items.reminder_at` в BullMQ как delayed-jobs; воркер шлёт пуш с экспоненциальным backoff, ловит Telegram 429 и «бот заблокирован», пишет `reminderStatus`. Fallback — это **view** тех же `checklist_items` (один источник, дедуп через `ackAt`). 152-ФЗ: экран согласия (флаг на `users`), `DELETE /projects/:id` каскадит и вычищает `spend_facts` по `project_id`. Seed-refresh — отдельный idempotent-таск.

**Tech Stack:** grammY, BullMQ, ioredis, NestJS, Prisma, vitest. Опирается на Планы 1–3.

**Источник правды:** спек §5.4, §11.4, §11.5, §11.8, §12.3, §12.9, §12.13, §12.14.

---

## File Structure

```
apps/
├── api/src/
│   ├── notification/
│   │   ├── reminder-scheduler.ts     # enqueue reminder_at as BullMQ delayed jobs
│   │   ├── reminder-delivery.ts      # deliver via bot + retries/429/blocked → status  [T9]
│   │   ├── deadlines.service.ts      # fallback view of checklist items (dedup via ackAt)
│   │   ├── notification.controller.ts# GET /projects/:id/deadlines, POST /checklist/:id/ack
│   │   └── notification.module.ts
│   ├── consent/
│   │   ├── consent.service.ts        # 152-ФЗ consent flag
│   │   └── consent.controller.ts     # POST /consent, GET /consent
│   ├── gdpr/
│   │   ├── deletion.service.ts       # DELETE project + purge spend_facts by project_id
│   │   └── deletion.controller.ts    # DELETE /projects/:id
│   └── ...
├── bot/
│   ├── package.json
│   ├── src/bot.ts                    # grammY bot, sendReminder, deep-link handling
│   └── src/main.ts
packages/db/prisma/
├── schema.prisma                     # + users.consentAt (migration)
└── refresh-seed.ts                   # quarterly seed price refresh  [T12]
apps/api/test/
└── critical-paths.e2e.test.ts        # 3 critical integration paths  [T13]
```

---

## Task 1: Миграция — согласие на обработке перс.данных [§11.4]

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (User.consentAt)

- [ ] **Step 1: Добавить поле в модель `User`**

```prisma
// add inside model User { ... }
consentAt DateTime? @map("consent_at")
```

- [ ] **Step 2: Миграция**

Run: `pnpm --filter @m/db exec prisma migrate dev --name user_consent`
Expected: миграция `user_consent` применена.

- [ ] **Step 3: Commit**

```bash
git add packages/db && git commit -m "feat(db): add user consent timestamp (152-ФЗ)"
```

---

## Task 2: `ConsentService` + контроллер [§11.4]

**Files:**
- Create: `apps/api/src/consent/consent.service.ts`, `apps/api/src/consent/consent.service.test.ts`, `apps/api/src/consent/consent.controller.ts`, `apps/api/src/consent/consent.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/consent/consent.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ConsentService } from "./consent.service";

describe("ConsentService", () => {
  it("records consent timestamp", async () => {
    const prisma = { user: { update: vi.fn(async () => ({ consentAt: new Date() })) } } as any;
    const svc = new ConsentService(prisma, { nowMs: () => 1000 } as any);
    await svc.grant("u1");
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { consentAt: new Date(1000) } });
  });

  it("reports whether consent is present", async () => {
    const prisma = { user: { findUnique: vi.fn(async () => ({ consentAt: new Date() })) } } as any;
    const svc = new ConsentService(prisma, { nowMs: () => 1000 } as any);
    expect(await svc.has("u1")).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — FAIL → реализовать `apps/api/src/consent/consent.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { Clock } from "../invite/invite.service";

@Injectable()
export class ConsentService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient, @Inject("CLOCK") private readonly clock: Clock) {}
  async grant(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { consentAt: new Date(this.clock.nowMs()) } });
  }
  async has(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return Boolean(u?.consentAt);
  }
}
```

- [ ] **Step 3: Реализовать контроллер `apps/api/src/consent/consent.controller.ts`**

```ts
import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { ConsentService } from "./consent.service";

@Controller("consent")
@UseGuards(JwtGuard)
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}
  @Get() async status(@Req() req: any) { return { granted: await this.consent.has(req.userId) }; }
  @Post() async grant(@Req() req: any) { await this.consent.grant(req.userId); return { ok: true }; }
}
```

- [ ] **Step 4: Реализовать модуль `apps/api/src/consent/consent.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { ConsentService } from "./consent.service";
import { ConsentController } from "./consent.controller";

@Module({
  controllers: [ConsentController],
  providers: [
    ConsentService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "CLOCK", useValue: { nowMs: () => Date.now() } },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
})
export class ConsentModule {}
```

- [ ] **Step 5: Подключить `ConsentModule`. PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/consent/consent.service.test.ts
git add apps/api/src && git commit -m "feat(api): 152-ФЗ consent grant/status"
```

---

## Task 3: `DeletionService` — удаление проекта + вычистка spend_facts [§11.4, §12.7]

**Files:**
- Create: `apps/api/src/gdpr/deletion.service.ts`, `apps/api/src/gdpr/deletion.service.test.ts`, `apps/api/src/gdpr/deletion.controller.ts`, `apps/api/src/gdpr/deletion.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/gdpr/deletion.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { DeletionService } from "./deletion.service";

describe("DeletionService.deleteProject", () => {
  it("purges spend_facts by project_id, then deletes the project (cascade)", async () => {
    const calls: string[] = [];
    const prisma = {
      $transaction: async (fn: any) => fn(prisma),
      spendFact: { deleteMany: vi.fn(async () => { calls.push("spend"); return { count: 3 }; }) },
      weddingProject: { delete: vi.fn(async () => { calls.push("project"); return {}; }) },
    } as any;
    const svc = new DeletionService(prisma);
    await svc.deleteProject("p1");
    expect(prisma.spendFact.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1" } });
    expect(prisma.weddingProject.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(calls).toEqual(["spend", "project"]); // spend_facts removed before cascade
  });
});
```

- [ ] **Step 2: Запустить — FAIL → реализовать `apps/api/src/gdpr/deletion.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";

/**
 * §11.4/§12.7: right to delete. spend_facts are intentionally un-linked from users
 * in aggregates, but carry project_id for exactly this purge. Delete them first,
 * then delete the project (cascades members/budget/payments/checklist).
 */
@Injectable()
export class DeletionService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}
  async deleteProject(projectId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.spendFact.deleteMany({ where: { projectId } });
      await tx.weddingProject.delete({ where: { id: projectId } });
    });
  }
}
```

- [ ] **Step 3: Реализовать контроллер `apps/api/src/gdpr/deletion.controller.ts`**

```ts
import { Controller, Delete, Param, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { DeletionService } from "./deletion.service";

@Controller("projects")
@UseGuards(JwtGuard)
export class DeletionController {
  constructor(private readonly deletion: DeletionService) {}
  @Delete(":id")
  async remove(@Param("id") id: string) { await this.deletion.deleteProject(id); return { ok: true }; }
}
```

- [ ] **Step 4: Реализовать модуль `apps/api/src/gdpr/deletion.module.ts`** (паттерн как ConsentModule, провайдеры `PRISMA`, `AUTH_CONFIG`). Подключить в `app.module.ts`.

- [ ] **Step 5: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/gdpr/deletion.service.test.ts
git add apps/api/src && git commit -m "feat(api): delete project purges spend_facts (152-ФЗ)"
```

---

## Task 4: `apps/bot` — каркас grammY

**Files:**
- Create: `apps/bot/package.json`, `apps/bot/tsconfig.json`, `apps/bot/src/bot.ts`, `apps/bot/src/bot.test.ts`, `apps/bot/src/main.ts`

- [ ] **Step 1: Создать `apps/bot/package.json`**

```json
{
  "name": "@m/bot",
  "version": "0.0.0",
  "type": "module",
  "scripts": { "dev": "tsx watch src/main.ts", "build": "tsc", "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "grammy": "^1.30.0", "@m/db": "workspace:*" },
  "devDependencies": { "typescript": "^5.5.0", "tsx": "^4.16.0", "vitest": "^2.0.0" }
}
```

- [ ] **Step 2: Создать `apps/bot/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src", "module": "ESNext", "moduleResolution": "Bundler" }, "include": ["src"] }
```

- [ ] **Step 3: Написать падающий тест `apps/bot/src/bot.test.ts`**

```ts
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
```

- [ ] **Step 4: Запустить — FAIL → реализовать `apps/bot/src/bot.ts`**

```ts
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
```

- [ ] **Step 5: Создать `apps/bot/src/main.ts`**

```ts
import { makeBot } from "./bot";
const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN required");
makeBot(token).start();
```

- [ ] **Step 6: PASS + commit**

```bash
pnpm install
pnpm --filter @m/bot exec vitest run src/bot.test.ts
git add apps/bot pnpm-lock.yaml && git commit -m "feat(bot): grammY bot + sendReminder with typed Telegram errors"
```

---

## Task 5: `ReminderDelivery` — ретраи/backoff/статус [T9, §11.5]

**Files:**
- Create: `apps/api/src/notification/reminder-delivery.ts`, `apps/api/src/notification/reminder-delivery.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/notification/reminder-delivery.test.ts`**

```ts
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
```

- [ ] **Step 2: Запустить — FAIL → реализовать `apps/api/src/notification/reminder-delivery.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { BotBlockedError, BotRateLimitError } from "../../../bot/src/bot";

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
```

- [ ] **Step 3: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/notification/reminder-delivery.test.ts
git add apps/api/src/notification && git commit -m "feat(api): reminder delivery with status, no-retry-on-blocked, dedup"
```

---

## Task 6: `ReminderScheduler` — постановка в BullMQ delayed + воркер с backoff

**Files:**
- Create: `apps/api/src/notification/reminder-scheduler.ts`, `apps/api/src/notification/reminder-scheduler.test.ts`, `apps/api/src/notification/notification.module.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/notification/reminder-scheduler.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ReminderScheduler } from "./reminder-scheduler";

describe("ReminderScheduler.schedule", () => {
  it("enqueues a delayed job with delay = reminderAt - now", async () => {
    const queue = { add: vi.fn(async () => ({})) } as any;
    const sched = new ReminderScheduler(queue, { nowMs: () => 1_000_000 } as any);
    await sched.schedule({ id: "ci1", reminderAt: new Date(1_060_000) }); // +60s
    expect(queue.add).toHaveBeenCalledWith(
      "reminder", { checklistItemId: "ci1" },
      expect.objectContaining({ delay: 60000, attempts: expect.any(Number), backoff: expect.objectContaining({ type: "exponential" }) }),
    );
  });

  it("enqueues immediately (delay 0) if reminderAt is in the past", async () => {
    const queue = { add: vi.fn(async () => ({})) } as any;
    const sched = new ReminderScheduler(queue, { nowMs: () => 2_000_000 } as any);
    await sched.schedule({ id: "ci1", reminderAt: new Date(1_000_000) });
    expect(queue.add).toHaveBeenCalledWith("reminder", { checklistItemId: "ci1" }, expect.objectContaining({ delay: 0 }));
  });
});
```

- [ ] **Step 2: Запустить — FAIL → реализовать `apps/api/src/notification/reminder-scheduler.ts`**

```ts
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
```

- [ ] **Step 3: Реализовать модуль `apps/api/src/notification/notification.module.ts`**

```ts
import { Module, OnModuleInit, OnModuleDestroy, Inject } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { prisma } from "@m/db";
import { ReminderScheduler } from "./reminder-scheduler";
import { ReminderDelivery } from "./reminder-delivery";
import { sendReminder, makeBot } from "../../../bot/src/bot";

const REMINDER_QUEUE = "reminders";
function conn() { const u = new URL(process.env.REDIS_URL ?? "redis://localhost:6379"); return { host: u.hostname, port: Number(u.port || 6379) }; }

@Module({
  providers: [
    ReminderScheduler, ReminderDelivery,
    { provide: "PRISMA", useValue: prisma },
    { provide: "CLOCK", useValue: { nowMs: () => Date.now() } },
    { provide: "REMINDER_QUEUE", useFactory: () => new Queue(REMINDER_QUEUE, { connection: conn() }) },
    { provide: "SEND_FN", useFactory: () => {
        const api = makeBot(process.env.BOT_TOKEN ?? "").api;
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
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/notification/reminder-scheduler.test.ts
git add apps/api/src/notification && git commit -m "feat(api): reminder scheduler (BullMQ delayed + exponential backoff)"
```

- [ ] **Step 5: Вызвать `ReminderScheduler.schedule` для каждого `checklist_item` с `reminderAt`** из `ChecklistService.instantiate` (План 3). Modify `checklist.service.ts`: внедрить `ReminderScheduler`, после `createMany` загрузить созданные items и `schedule` каждый. Обновить тест ChecklistService (замокать scheduler). Commit: `feat(api): schedule reminders on checklist instantiation`.

---

## Task 7: `DeadlinesService` — видимый fallback (view) + ack [§11.5, §12.9]

**Files:**
- Create: `apps/api/src/notification/deadlines.service.ts`, `apps/api/src/notification/deadlines.service.test.ts`, `apps/api/src/notification/notification.controller.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/notification/deadlines.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { DeadlinesService } from "./deadlines.service";

describe("DeadlinesService", () => {
  it("lists upcoming non-done deadlines with delivery status (single source)", async () => {
    const prisma = { checklistItem: { findMany: vi.fn(async () => [
      { id: "ci1", title: "ЗАГС", dueDate: new Date("2026-07-28"), reminderStatus: "blocked", done: false, ackAt: null },
    ]) } } as any;
    const svc = new DeadlinesService(prisma);
    const res = await svc.upcoming("p1");
    expect(res[0]).toMatchObject({ id: "ci1", reminderStatus: "blocked" });
  });

  it("ack sets ackAt so push and view both stop (dedup)", async () => {
    const prisma = { checklistItem: { update: vi.fn(async () => ({})) } } as any;
    const svc = new DeadlinesService(prisma, { nowMs: () => 1000 } as any);
    await svc.ack("ci1");
    expect(prisma.checklistItem.update).toHaveBeenCalledWith({ where: { id: "ci1" }, data: { ackAt: new Date(1000) } });
  });
});
```

- [ ] **Step 2: Запустить — FAIL → реализовать `apps/api/src/notification/deadlines.service.ts`**

```ts
import { Injectable, Inject, Optional } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { Clock } from "../invite/invite.service";

/**
 * §11.5/§12.9: the Mini App fallback is a VIEW over the same checklist_items
 * (single source of truth), not an independent trigger. ack() sets ackAt which
 * both the push worker (skips) and this view honor → deadline communicated once.
 */
@Injectable()
export class DeadlinesService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient, @Optional() @Inject("CLOCK") private readonly clock?: Clock) {}

  async upcoming(projectId: string) {
    const rows = await this.prisma.checklistItem.findMany({
      where: { projectId, done: false, ackAt: null }, orderBy: { dueDate: "asc" },
    });
    return rows.map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate, reminderStatus: r.reminderStatus }));
  }

  async ack(checklistItemId: string): Promise<void> {
    const now = this.clock?.nowMs() ?? Date.now();
    await this.prisma.checklistItem.update({ where: { id: checklistItemId }, data: { ackAt: new Date(now) } });
  }
}
```

- [ ] **Step 3: Реализовать контроллер `apps/api/src/notification/notification.controller.ts`**

```ts
import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { DeadlinesService } from "./deadlines.service";

@Controller()
@UseGuards(JwtGuard)
export class NotificationController {
  constructor(private readonly deadlines: DeadlinesService) {}
  @Get("projects/:id/deadlines")
  list(@Param("id") projectId: string) { return this.deadlines.upcoming(projectId); }
  @Post("checklist/:itemId/ack")
  async ack(@Param("itemId") itemId: string) { await this.deadlines.ack(itemId); return { ok: true }; }
}
```

- [ ] **Step 4: Зарегистрировать `DeadlinesService` + `NotificationController` в `NotificationModule` (controllers + providers `AUTH_CONFIG`). PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/notification/deadlines.service.test.ts
git add apps/api/src/notification && git commit -m "feat(api): visible deadlines fallback view + ack dedup"
```

---

## Task 8: Обновление seed-цен (квартальный таск) [T12, §12.13]

**Files:**
- Create: `packages/db/prisma/refresh-seed.ts`, `packages/db/prisma/refresh-seed.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/db/prisma/refresh-seed.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/index";
import { seed } from "./seed";
import { refreshSeed } from "./refresh-seed";

describe("refreshSeed", () => {
  beforeAll(async () => { await seed(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("bumps seed medians by the inflation factor and updates as_of_year", async () => {
    const before = await prisma.priceBenchmark.findFirstOrThrow({ where: { source: "seed", category: { slug: "banquet" } } });
    await refreshSeed({ factor: 1.2, asOfYear: 2027 });
    const after = await prisma.priceBenchmark.findFirstOrThrow({ where: { source: "seed", category: { slug: "banquet" } } });
    expect(after.median).toBe((before.median * 12n) / 10n);
    expect(after.asOfYear).toBe(2027);
  });
});
```

- [ ] **Step 2: Запустить — FAIL → реализовать `packages/db/prisma/refresh-seed.ts`**

```ts
import { prisma } from "../src/index";

/**
 * §12.13: quarterly seed refresh. Market grows ~+20%/year; without this the
 * estimate hook lowballs within ~6 months. Run by a named owner; idempotent per
 * (factor, asOfYear) — re-running with the same asOfYear that already applied is a no-op.
 */
export async function refreshSeed(opts: { factor: number; asOfYear: number }): Promise<void> {
  const num = BigInt(Math.round(opts.factor * 10));
  const seedRows = await prisma.priceBenchmark.findMany({ where: { source: "seed" } });
  for (const r of seedRows) {
    if (r.asOfYear === opts.asOfYear) continue; // already at target year
    await prisma.priceBenchmark.update({
      where: { categoryId_city_tier_source: { categoryId: r.categoryId, city: r.city, tier: r.tier, source: "seed" } },
      data: { p25: (r.p25 * num) / 10n, median: (r.median * num) / 10n, p75: (r.p75 * num) / 10n, asOfYear: opts.asOfYear },
    });
  }
}

if (process.argv[1]?.endsWith("refresh-seed.ts")) {
  refreshSeed({ factor: 1.2, asOfYear: new Date().getUTCFullYear() }).then(() => prisma.$disconnect());
}
```

- [ ] **Step 3: PASS + commit**

```bash
pnpm --filter @m/db exec vitest run prisma/refresh-seed.test.ts
git add packages/db/prisma && git commit -m "feat(db): quarterly seed price refresh task"
```

---

## Task 9: Критичные integration-тесты [T13, §12.14]

**Files:**
- Create: `apps/api/test/critical-paths.e2e.test.ts`

> Эти три теста — главный гейт надёжности из §12.14. Они используют живую тестовую БД (docker compose) и моки бота/очереди, чтобы детерминированно проверить тихие сбои.

- [ ] **Step 1: Написать тесты `apps/api/test/critical-paths.e2e.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@m/db";
import { seed } from "../../../packages/db/prisma/seed";
import { ReminderDelivery } from "../src/notification/reminder-delivery";
import { BenchmarkReader } from "../src/estimate/benchmark-reader";
import { InviteService } from "../src/invite/invite.service";
import { BotBlockedError } from "../../bot/src/bot";

beforeAll(async () => { await seed(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("CRITICAL PATH 1 — reminder fail → status → visible in fallback (§12.14.1)", () => {
  it("blocked bot marks status=blocked and the deadline still surfaces in deadlines view", async () => {
    const owner = await prisma.user.create({ data: { telegramId: BigInt(Date.now()) } });
    const project = await prisma.weddingProject.create({ data: { ownerId: owner.id, city: "msk", weddingDate: new Date("2026-09-01"), format: "zags", guestCount: 50, tier: "mid" } });
    await prisma.checklistTemplate.upsert({ where: { key: "zags_application_msk" }, update: {}, create: { key: "zags_application_msk", title: "Подать заявление", kind: "zags", offsetDaysBeforeWedding: 35 } });
    const item = await prisma.checklistItem.create({ data: { projectId: project.id, templateKey: "zags_application_msk", title: "Подать заявление", dueDate: new Date("2026-07-28"), reminderAt: new Date("2026-07-25") } });

    const delivery = new ReminderDelivery(prisma as any, async () => { throw new BotBlockedError("blocked"); });
    const outcome = await delivery.deliver(item.id);
    expect(outcome).toBe("blocked");

    const refreshed = await prisma.checklistItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(refreshed.reminderStatus).toBe("blocked");
    // visible fallback: not done, not acked → still listed
    const upcoming = await prisma.checklistItem.findMany({ where: { projectId: project.id, done: false, ackAt: null } });
    expect(upcoming.some((i) => i.id === item.id)).toBe(true);
  });
});

describe("CRITICAL PATH 2 — k-anon boundary never leaks a small sample (§12.14.2)", () => {
  it("crowd with sampleCount < threshold returns seed, never the raw small sample", async () => {
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: "banquet" } });
    await prisma.priceBenchmark.upsert({
      where: { categoryId_city_tier_source: { categoryId: cat.id, city: "msk", tier: "mid", source: "crowd" } },
      update: { p25: 1n, median: 2n, p75: 3n, sampleCount: 2, asOfYear: null },
      create: { categoryId: cat.id, city: "msk", tier: "mid", source: "crowd", p25: 1n, median: 2n, p75: 3n, sampleCount: 2, asOfYear: null },
    });
    const reader = new BenchmarkReader(prisma as any, { threshold: 5 });
    const res = await reader.getAggregates({ city: "msk", tier: "mid", format: "zags" }, ["banquet"]);
    const agg = res.get("banquet");
    expect(agg && "source" in agg && agg.source).toBe("seed"); // NOT the 2-sample crowd row
  });
});

describe("CRITICAL PATH 3 — invite token expired/revoked/reused is rejected (§12.14.3)", () => {
  const clock = { nowMs: () => Date.parse("2026-06-01T00:00:00Z") };
  it("rejects expired, revoked, and already-used tokens", async () => {
    const owner = await prisma.user.create({ data: { telegramId: BigInt(Date.now() + 1) } });
    const partner = await prisma.user.create({ data: { telegramId: BigInt(Date.now() + 2) } });
    const project = await prisma.weddingProject.create({ data: { ownerId: owner.id, city: "msk", weddingDate: new Date("2026-09-01"), format: "zags", guestCount: 50, tier: "mid" } });
    const svc = new InviteService(prisma as any, clock as any);

    // expired
    const expired = await prisma.inviteToken.create({ data: { token: `exp_${Date.now()}`, projectId: project.id, role: "partner", expiresAt: new Date("2026-05-01") } });
    await expect(svc.accept(expired.token, partner.id)).rejects.toThrow(/expired/);

    // happy then reuse
    const fresh = await svc.create(project.id, 7);
    await svc.accept(fresh.token, partner.id);
    await expect(svc.accept(fresh.token, partner.id)).rejects.toThrow(/already used/);

    // revoked
    const r = await svc.create(project.id, 7);
    await svc.revoke(r.token);
    await expect(svc.accept(r.token, partner.id)).rejects.toThrow(/revoked/);
  });
});
```

- [ ] **Step 2: Запустить (нужна живая БД)**

Run:
```bash
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @m/db exec prisma migrate deploy
pnpm --filter @m/api exec vitest run test/critical-paths.e2e.test.ts
```
Expected: 3 describe-блока зелёные.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test && git commit -m "test(api): 3 critical integration paths (reminder fallback, k-anon, invite)"
```

---

## Task 10: Сквозная проверка Плана 4 и всего v1

- [ ] **Step 1: Полный прогон**

Run: `pnpm turbo run typecheck test`
Expected: все пакеты и приложения зелёные.

- [ ] **Step 2: Build всего монорепо**

Run: `pnpm turbo run build`
Expected: api/miniapp/bot/packages собираются.

- [ ] **Step 3: Финальный commit**

```bash
git add -A && git commit -m "chore: plan 4 done — reminders, consent, deletion, refresh, critical tests" || echo "nothing to commit"
```

---

## Self-Review (закрыто)

- **Spec coverage:** §5.4 (reminder_at → очередь → бот), §11.4 (consent + право на удаление + вычистка spend_facts), §11.5 (ретраи/429/blocked, статус доставки, видимый fallback), §11.8 (метрики — из Плана 2, инкременты в delivery можно добавить), §12.3 (auth уже в Плане 1), §12.9 (fallback как view + ack дедуп), §12.13 (seed-refresh), §12.14 (3 крит. integration-теста) — покрыты.
- **Out of v1 (по дизайну):** браузерный E2E (§8/§12.14 — позже), Фаза 2 (доверие/маркетплейс).
- **Type consistency:** `BotBlockedError`/`BotRateLimitError` импортируются и в delivery, и в тестах; `ReminderScheduler.schedule({id, reminderAt})` совпадает с тем, как `ChecklistService` создаёт items; `DeadlinesService.ack` и `ReminderDelivery` оба читают/уважают `ackAt` (один источник); `DeletionService` чистит `spend_facts` по `projectId` (поле из Плана 1, упрощено Планом 2).

## Параметры
- BullMQ: `attempts=5`, `backoff exponential delay=30000`; `REMINDER_LEAD_DAYS=3` (План 3); seed-refresh factor 1.2/год; consent — gate на первом входе (UI Mini App проверяет `GET /consent`).

---

## Итог по 4 планам

| План | Что даёт | Ключевые задачи ревью |
|------|----------|----------------------|
| 1 | Анонимная ₽-смета (Фаза 0) | T2,T3,T4 + фундамент |
| 2 | Виральная петля + сбор данных | T1,T6,T7,T8,T10,11.8 |
| 3 | Трекер/делегирование/чеклист | T5,T11,T14,11.7 |
| 4 | Надёжные напоминания + 152-ФЗ | T9,T12,T13 |

Все 14 задач Eng-ревью и 9 интегрированных находок outside voice распределены по планам. Рекомендуемый порядок исполнения = порядок планов (1→2→3→4); внутри плана задачи в основном последовательны из-за общих модулей `apps/api`.
