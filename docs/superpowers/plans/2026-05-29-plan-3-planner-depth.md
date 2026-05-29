# План 3 — Планировщик: глубина (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать паре полноценный планировщик: трекер бюджета и платежей с оптимистичной блокировкой, делегирование партнёру по защищённому инвайт-токену, ЗАГС/таймлайн-чеклист как compliance-контент, и камерный режим.

**Architecture:** Budget-контекст (NestJS) управляет `budget_items`/`payments` с полем `version` (optimistic lock на финансах); ввод платежа триггерит `SpendFactService.recompute` из Плана 2. Делегирование — криптослучайный одноразовый инвайт-токен с истечением и отзывом. Checklist/Timeline инстанцирует пункты из `checklist_templates` по `wedding_date`; ЗАГС-шаблоны несут `source_url`/`review_date`/`city`. Камерный режим (`format=kamernaya`) перекраивает смету и подменяет ветку чеклиста.

**Tech Stack:** NestJS, Prisma, zod, vitest. Опирается на Планы 1–2.

**Источник правды:** спек §5.2, §5.3, §5.4, §7, §11.3, §11.7, §12.6, §12.7, §12.12.

---

## File Structure

```
apps/api/src/
├── budget/
│   ├── budget.service.ts          # CRUD budget_items + optimistic lock  [T5]
│   ├── payment.service.ts         # CRUD payments + version + spend recompute
│   ├── optimistic.ts              # updateWithVersion helper (409 on conflict)
│   ├── budget.controller.ts       # /projects/:id/items, /items/:id/payments
│   └── budget.module.ts
├── invite/
│   ├── invite-token.ts            # crypto-random token generation
│   ├── invite.service.ts          # create / accept / revoke  [11.7]
│   ├── invite.controller.ts       # POST /projects/:id/invite, POST /invite/accept
│   └── invite.module.ts
├── checklist/
│   ├── checklist.service.ts       # instantiate items from templates by wedding_date
│   ├── checklist.controller.ts    # GET/PATCH checklist items
│   └── checklist.module.ts
└── estimate/
    └── format-profile.ts          # kamernaya re-shape of categories  [T14]
packages/db/prisma/
├── schema.prisma                  # + InviteToken model (migration)
└── seed-checklist.ts              # zags/vendor/general templates with source_url
```

---

## Task 1: Хелпер optimistic lock [T5, §12.6]

**Files:**
- Create: `apps/api/src/budget/optimistic.ts`, `apps/api/src/budget/optimistic.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/budget/optimistic.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { updateWithVersion } from "./optimistic";

describe("updateWithVersion", () => {
  it("bumps version and returns row when version matches", async () => {
    const delegate = { updateMany: vi.fn(async () => ({ count: 1 })), findUniqueOrThrow: vi.fn(async () => ({ id: "x", version: 3 })) };
    const res = await updateWithVersion(delegate as any, "x", 2, { plannedAmount: 100n });
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id: "x", version: 2 }, data: { plannedAmount: 100n, version: { increment: 1 } },
    });
    expect(res.version).toBe(3);
  });

  it("throws ConflictException (409) when version does not match", async () => {
    const delegate = { updateMany: vi.fn(async () => ({ count: 0 })), findUniqueOrThrow: vi.fn() };
    await expect(updateWithVersion(delegate as any, "x", 1, { plannedAmount: 1n }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/budget/optimistic.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/budget/optimistic.ts`**

```ts
import { ConflictException } from "@nestjs/common";

interface VersionedDelegate {
  updateMany(args: { where: any; data: any }): Promise<{ count: number }>;
  findUniqueOrThrow(args: { where: { id: string } }): Promise<any>;
}

/**
 * §12.6: optimistic lock on financial rows. UPDATE ... WHERE id AND version;
 * 0 rows affected → someone edited concurrently → 409 (client must reload).
 */
export async function updateWithVersion<T>(
  delegate: VersionedDelegate, id: string, expectedVersion: number, data: Record<string, unknown>,
): Promise<T> {
  const res = await delegate.updateMany({
    where: { id, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count === 0) throw new ConflictException("данные изменились, обновите и повторите");
  return delegate.findUniqueOrThrow({ where: { id } }) as Promise<T>;
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/budget/optimistic.test.ts
git add apps/api/src/budget && git commit -m "feat(api): optimistic-lock update helper (409 on conflict)"
```

---

## Task 2: `BudgetService` — статьи бюджета с версией

**Files:**
- Create: `apps/api/src/budget/budget.service.ts`, `apps/api/src/budget/budget.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/budget/budget.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { BudgetService } from "./budget.service";

function fakePrisma() {
  return {
    budgetItem: {
      create: vi.fn(async ({ data }: any) => ({ id: "b1", version: 0, ...data })),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(async () => ({ id: "b1", version: 1, plannedAmount: 100n })),
    },
  } as any;
}

describe("BudgetService", () => {
  it("creates a budget item", async () => {
    const prisma = fakePrisma();
    const svc = new BudgetService(prisma);
    const item = await svc.addItem("p1", { categoryId: "c1", plannedAmount: "100", vendorName: "Foto" });
    expect(item.id).toBe("b1");
    expect(prisma.budgetItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "p1", plannedAmount: 100n }) }),
    );
  });

  it("updates with version, 409 on stale version", async () => {
    const prisma = fakePrisma();
    prisma.budgetItem.updateMany.mockResolvedValue({ count: 0 });
    const svc = new BudgetService(prisma);
    await expect(svc.updateItem("b1", 0, { plannedAmount: "200" })).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/budget/budget.service.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/budget/budget.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { updateWithVersion } from "./optimistic";

@Injectable()
export class BudgetService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async addItem(projectId: string, input: { categoryId: string; plannedAmount: string; vendorName?: string }) {
    return this.prisma.budgetItem.create({
      data: { projectId, categoryId: input.categoryId, plannedAmount: BigInt(input.plannedAmount), vendorName: input.vendorName ?? null },
    });
  }

  async updateItem(id: string, expectedVersion: number, patch: { plannedAmount?: string; vendorName?: string; status?: string }) {
    const data: Record<string, unknown> = {};
    if (patch.plannedAmount !== undefined) data.plannedAmount = BigInt(patch.plannedAmount);
    if (patch.vendorName !== undefined) data.vendorName = patch.vendorName;
    if (patch.status !== undefined) data.status = patch.status;
    return updateWithVersion(this.prisma.budgetItem as any, id, expectedVersion, data);
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/budget/budget.service.test.ts
git add apps/api/src/budget && git commit -m "feat(api): budget items with optimistic lock"
```

---

## Task 3: `PaymentService` — платежи + version + триггер recompute [§5.2.3, §12.7]

**Files:**
- Create: `apps/api/src/budget/payment.service.ts`, `apps/api/src/budget/payment.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/budget/payment.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { PaymentService } from "./payment.service";

function fakePrisma() {
  return {
    payment: {
      create: vi.fn(async ({ data }: any) => ({ id: "pay1", version: 0, ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => ({ id: "pay1", version: 1, budgetItemId: "b1" })),
      delete: vi.fn(async () => ({ id: "pay1", budgetItemId: "b1" })),
    },
    budgetItem: { findUniqueOrThrow: vi.fn(async () => ({ id: "b1", projectId: "p1", categoryId: "c1" })) },
  } as any;
}

describe("PaymentService", () => {
  it("creates a payment and recomputes the spend fact for its (project,category)", async () => {
    const prisma = fakePrisma();
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await svc.addPayment("b1", { type: "prepay", amount: "50000000", payer: "couple" });
    expect(prisma.payment.create).toHaveBeenCalled();
    expect(spend.recompute).toHaveBeenCalledWith("p1", "c1");
  });

  it("recomputes after deleting a payment", async () => {
    const prisma = fakePrisma();
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await svc.deletePayment("pay1");
    expect(spend.recompute).toHaveBeenCalledWith("p1", "c1");
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/budget/payment.service.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/budget/payment.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { updateWithVersion } from "./optimistic";
import { SpendFactService } from "../spend/spend-fact.service";

@Injectable()
export class PaymentService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly spend: SpendFactService,
  ) {}

  private async recomputeFor(budgetItemId: string) {
    const item = await this.prisma.budgetItem.findUniqueOrThrow({ where: { id: budgetItemId } });
    await this.spend.recompute(item.projectId, item.categoryId);
  }

  async addPayment(budgetItemId: string, input: { type: string; amount: string; payer: string; dueDate?: string; paidAt?: string }) {
    const payment = await this.prisma.payment.create({
      data: {
        budgetItemId, type: input.type, amount: BigInt(input.amount), payer: input.payer,
        dueDate: input.dueDate ? new Date(input.dueDate) : null, paidAt: input.paidAt ? new Date(input.paidAt) : null,
      },
    });
    await this.recomputeFor(budgetItemId);
    return payment;
  }

  async updatePayment(id: string, expectedVersion: number, patch: { amount?: string; paidAt?: string }) {
    const data: Record<string, unknown> = {};
    if (patch.amount !== undefined) data.amount = BigInt(patch.amount);
    if (patch.paidAt !== undefined) data.paidAt = new Date(patch.paidAt);
    const updated = await updateWithVersion<{ budgetItemId: string }>(this.prisma.payment as any, id, expectedVersion, data);
    await this.recomputeFor(updated.budgetItemId);
    return updated;
  }

  async deletePayment(id: string) {
    const deleted = await this.prisma.payment.delete({ where: { id } });
    await this.recomputeFor(deleted.budgetItemId);
    return { ok: true };
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/budget/payment.service.test.ts
git add apps/api/src/budget && git commit -m "feat(api): payments with version + spend recompute on change"
```

---

## Task 4: Budget-контроллер и модуль

**Files:**
- Create: `apps/api/src/budget/budget.controller.ts`, `apps/api/src/budget/budget.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Реализовать контроллер `apps/api/src/budget/budget.controller.ts`**

```ts
import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { BudgetService } from "./budget.service";
import { PaymentService } from "./payment.service";

const AddItem = z.object({ categoryId: z.string(), plannedAmount: z.string(), vendorName: z.string().optional() });
const PatchItem = z.object({ version: z.number().int(), plannedAmount: z.string().optional(), vendorName: z.string().optional(), status: z.string().optional() });
const AddPayment = z.object({ type: z.enum(["prepay", "balance", "full"]), amount: z.string(), payer: z.enum(["couple", "parents", "other"]), dueDate: z.string().optional(), paidAt: z.string().optional() });

@Controller()
@UseGuards(JwtGuard)
export class BudgetController {
  constructor(private readonly budget: BudgetService, private readonly payments: PaymentService) {}

  @Post("projects/:id/items")
  addItem(@Param("id") projectId: string, @Body() body: unknown) {
    return this.budget.addItem(projectId, AddItem.parse(body));
  }

  @Patch("items/:itemId")
  patchItem(@Param("itemId") itemId: string, @Body() body: unknown) {
    const { version, ...patch } = PatchItem.parse(body);
    return this.budget.updateItem(itemId, version, patch);
  }

  @Post("items/:itemId/payments")
  addPayment(@Param("itemId") itemId: string, @Body() body: unknown) {
    return this.payments.addPayment(itemId, AddPayment.parse(body));
  }

  @Delete("payments/:paymentId")
  deletePayment(@Param("paymentId") paymentId: string) {
    return this.payments.deletePayment(paymentId);
  }
}
```

- [ ] **Step 2: Реализовать модуль `apps/api/src/budget/budget.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { BudgetService } from "./budget.service";
import { PaymentService } from "./payment.service";
import { BudgetController } from "./budget.controller";
import { SpendFactService } from "../spend/spend-fact.service";

@Module({
  controllers: [BudgetController],
  providers: [
    BudgetService, PaymentService, SpendFactService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
})
export class BudgetModule {}
```

> Примечание: `SpendFactService` в Плане 2 внедряет `"AGG_QUEUE"`. Зарегистрируй `"AGG_QUEUE"` провайдер здесь тоже (через `makeAggregationQueue`) или импортируй общий `AggregationModule` и сделай `SpendFactService` экспортируемым из него. Рекомендуется второе: `imports: [AggregationModule]`, тогда `SpendFactService` не дублируется.

- [ ] **Step 3: Подключить `BudgetModule` в `app.module.ts`. Typecheck + commit**

```bash
pnpm --filter @m/api typecheck
git add apps/api/src && git commit -m "feat(api): budget controller (items + payments)"
```

---

## Task 5: Инвайт-токен — генерация [11.7]

**Files:**
- Create: `apps/api/src/invite/invite-token.ts`, `apps/api/src/invite/invite-token.test.ts`
- Modify: `packages/db/prisma/schema.prisma` (+ InviteToken)

- [ ] **Step 1: Добавить модель в `packages/db/prisma/schema.prisma`**

```prisma
model InviteToken {
  token      String   @id            // long crypto-random
  projectId  String   @map("project_id")
  project    WeddingProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  role       String   @default("partner")
  expiresAt  DateTime @map("expires_at")
  acceptedAt DateTime? @map("accepted_at")
  revokedAt  DateTime? @map("revoked_at")
  createdAt  DateTime @default(now()) @map("created_at")
  @@map("invite_tokens")
}
```

Добавь обратную связь в `WeddingProject`: `inviteTokens InviteToken[]`. Затем:
```bash
pnpm --filter @m/db exec prisma migrate dev --name invite_token
```

- [ ] **Step 2: Написать падающий тест `apps/api/src/invite/invite-token.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { generateInviteToken } from "./invite-token";

describe("generateInviteToken", () => {
  it("produces a long url-safe token", () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });
  it("produces unique tokens", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});
```

- [ ] **Step 3: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/invite/invite-token.test.ts`

- [ ] **Step 4: Реализовать `apps/api/src/invite/invite-token.ts`**

```ts
import { randomBytes } from "node:crypto";

/** Long, crypto-random, url-safe invite token (11.7 — not guessable). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}
```

- [ ] **Step 5: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/invite/invite-token.test.ts
git add apps/api/src/invite packages/db && git commit -m "feat(api): crypto-random invite token + InviteToken model"
```

---

## Task 6: `InviteService` — create / accept / revoke [11.7, §5.3]

**Files:**
- Create: `apps/api/src/invite/invite.service.ts`, `apps/api/src/invite/invite.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/invite/invite.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { InviteService } from "./invite.service";

function fakePrisma(token?: any) {
  return {
    inviteToken: {
      create: vi.fn(async ({ data }: any) => ({ ...data })),
      findUnique: vi.fn(async () => token ?? null),
      update: vi.fn(async () => ({})),
    },
    projectMember: { upsert: vi.fn(async () => ({})) },
  } as any;
}
const cfg = { nowMs: () => 1_000_000 } as any;

describe("InviteService", () => {
  it("creates a token with expiry", async () => {
    const prisma = fakePrisma();
    const svc = new InviteService(prisma, cfg);
    const res = await svc.create("p1", 7);
    expect(res.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(prisma.inviteToken.create).toHaveBeenCalled();
  });

  it("accept: binds partner once, then invalidates token", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: null });
    const svc = new InviteService(prisma, cfg);
    await svc.accept("t", "u2");
    expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ projectId: "p1", userId: "u2", role: "partner" }) }),
    );
    expect(prisma.inviteToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acceptedAt: expect.anything() }) }),
    );
  });

  it("accept: rejects expired token", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(500_000), acceptedAt: null, revokedAt: null });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accept: rejects already-accepted token (one-time)", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: new Date(900_000), revokedAt: null });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accept: rejects revoked token", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: new Date(900_000) });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/invite/invite.service.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/invite/invite.service.ts`**

```ts
import { Injectable, Inject, ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { generateInviteToken } from "./invite-token";

export interface Clock { nowMs(): number; }

@Injectable()
export class InviteService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("CLOCK") private readonly clock: Clock,
  ) {}

  async create(projectId: string, ttlDays: number): Promise<{ token: string; expiresAt: Date }> {
    const token = generateInviteToken();
    const expiresAt = new Date(this.clock.nowMs() + ttlDays * 86400 * 1000);
    await this.prisma.inviteToken.create({ data: { token, projectId, role: "partner", expiresAt } });
    return { token, expiresAt };
  }

  async accept(token: string, userId: string): Promise<{ projectId: string }> {
    const row = await this.prisma.inviteToken.findUnique({ where: { token } });
    if (!row) throw new ForbiddenException("invite not found");
    if (row.revokedAt) throw new ForbiddenException("invite revoked");
    if (row.acceptedAt) throw new ForbiddenException("invite already used");
    if (row.expiresAt.getTime() < this.clock.nowMs()) throw new ForbiddenException("invite expired");

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: row.projectId, userId } },
      update: { role: row.role },
      create: { projectId: row.projectId, userId, role: row.role },
    });
    await this.prisma.inviteToken.update({ where: { token }, data: { acceptedAt: new Date(this.clock.nowMs()) } });
    return { projectId: row.projectId };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.inviteToken.update({ where: { token }, data: { revokedAt: new Date(this.clock.nowMs()) } });
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/invite/invite.service.test.ts
git add apps/api/src/invite && git commit -m "feat(api): invite service — create/accept(once)/revoke with expiry"
```

---

## Task 7: Invite-контроллер и модуль

**Files:**
- Create: `apps/api/src/invite/invite.controller.ts`, `apps/api/src/invite/invite.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Реализовать контроллер `apps/api/src/invite/invite.controller.ts`**

```ts
import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { InviteService } from "./invite.service";

@Controller()
@UseGuards(JwtGuard)
export class InviteController {
  constructor(private readonly invites: InviteService) {}

  @Post("projects/:id/invite")
  async create(@Param("id") projectId: string) {
    const { token, expiresAt } = await this.invites.create(projectId, 7);
    const link = `https://t.me/${process.env.BOT_USERNAME ?? "mplanner_bot"}?startapp=invite_${token}`;
    return { token, link, expiresAt };
  }

  @Post("invite/accept")
  accept(@Req() req: any, @Body() body: unknown) {
    const { token } = z.object({ token: z.string() }).parse(body);
    return this.invites.accept(token, req.userId);
  }

  @Post("invite/revoke")
  async revoke(@Body() body: unknown) {
    const { token } = z.object({ token: z.string() }).parse(body);
    await this.invites.revoke(token);
    return { ok: true };
  }
}
```

- [ ] **Step 2: Реализовать модуль `apps/api/src/invite/invite.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { InviteService } from "./invite.service";
import { InviteController } from "./invite.controller";

@Module({
  controllers: [InviteController],
  providers: [
    InviteService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "CLOCK", useValue: { nowMs: () => Date.now() } },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
})
export class InviteModule {}
```

- [ ] **Step 3: Подключить `InviteModule`. Typecheck + commit**

```bash
pnpm --filter @m/api typecheck
git add apps/api/src && git commit -m "feat(api): invite controller (create/accept/revoke)"
```

---

## Task 8: ЗАГС/таймлайн шаблоны как compliance-контент [T11, §12.12, §9]

**Files:**
- Create: `packages/db/prisma/seed-checklist.ts`, `packages/db/prisma/seed-checklist.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/db/prisma/seed-checklist.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/index";
import { seedChecklist } from "./seed-checklist";

describe("seedChecklist", () => {
  beforeAll(async () => { await seedChecklist(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("seeds zags templates with source_url and review_date per city", async () => {
    const zags = await prisma.checklistTemplate.findMany({ where: { kind: "zags" } });
    expect(zags.length).toBeGreaterThan(0);
    for (const t of zags) {
      expect(t.sourceUrl).toBeTruthy();   // §12.12 — compliance content cites a source
      expect(t.reviewDate).not.toBeNull();
      expect(t.city).toBeTruthy();        // per-city variation (МСК/СПб)
    }
  });

  it("seeds general vendor-booking templates with offsets", async () => {
    const photo = await prisma.checklistTemplate.findUnique({ where: { key: "book_photo" } });
    expect(photo?.offsetDaysBeforeWedding).toBeGreaterThanOrEqual(150); // ~6 months
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/db exec vitest run prisma/seed-checklist.test.ts`

- [ ] **Step 3: Реализовать `packages/db/prisma/seed-checklist.ts`**

```ts
import { prisma } from "../src/index";

// §12.12: ЗАГС templates are compliance content — each cites a source and a review date,
// and varies by city. VERIFY against the live regulator before launch (named owner).
const REVIEW = new Date("2026-05-29");

const TEMPLATES = [
  // ЗАГС (per city) — sourceUrl must point to the regional ЗАГС/Госуслуги rule.
  { key: "zags_application_msk", title: "Подать заявление в ЗАГС (Москва)", kind: "zags", offsetDaysBeforeWedding: 35, city: "msk", sourceUrl: "https://www.mos.ru/services/", reviewDate: REVIEW },
  { key: "zags_docs_msk", title: "Собрать документы для ЗАГС (паспорта, оплата госпошлины)", kind: "zags", offsetDaysBeforeWedding: 40, city: "msk", sourceUrl: "https://www.mos.ru/services/", reviewDate: REVIEW },
  { key: "zags_application_spb", title: "Подать заявление в ЗАГС (Санкт-Петербург)", kind: "zags", offsetDaysBeforeWedding: 35, city: "spb", sourceUrl: "https://gu.spb.ru/", reviewDate: REVIEW },
  { key: "zags_docs_spb", title: "Собрать документы для ЗАГС (паспорта, оплата госпошлины)", kind: "zags", offsetDaysBeforeWedding: 40, city: "spb", sourceUrl: "https://gu.spb.ru/", reviewDate: REVIEW },
  // Vendor booking (city-agnostic)
  { key: "book_photo", title: "Забронировать фотографа", kind: "vendor", offsetDaysBeforeWedding: 180, city: null, sourceUrl: null, reviewDate: null },
  { key: "book_host", title: "Забронировать ведущего", kind: "vendor", offsetDaysBeforeWedding: 180, city: null, sourceUrl: null, reviewDate: null },
  { key: "buy_dress", title: "Выбрать и заказать платье", kind: "vendor", offsetDaysBeforeWedding: 90, city: null, sourceUrl: null, reviewDate: null },
  // General
  { key: "guest_list", title: "Составить список гостей", kind: "general", offsetDaysBeforeWedding: 120, city: null, sourceUrl: null, reviewDate: null },
] as const;

export async function seedChecklist() {
  for (const t of TEMPLATES) {
    await prisma.checklistTemplate.upsert({
      where: { key: t.key },
      update: { title: t.title, kind: t.kind, offsetDaysBeforeWedding: t.offsetDaysBeforeWedding, city: t.city, sourceUrl: t.sourceUrl, reviewDate: t.reviewDate },
      create: { key: t.key, title: t.title, kind: t.kind, offsetDaysBeforeWedding: t.offsetDaysBeforeWedding, city: t.city, sourceUrl: t.sourceUrl, reviewDate: t.reviewDate },
    });
  }
}

if (process.argv[1]?.endsWith("seed-checklist.ts")) {
  seedChecklist().then(() => prisma.$disconnect()).then(() => console.log("checklist seeded"));
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/db exec vitest run prisma/seed-checklist.test.ts
git add packages/db/prisma && git commit -m "feat(db): zags compliance + vendor checklist templates with source/review/city"
```

---

## Task 9: `ChecklistService` — инстанцирование по дате + камерный режим [§5.4, §11.3, T14]

**Files:**
- Create: `apps/api/src/estimate/format-profile.ts`, `apps/api/src/estimate/format-profile.test.ts`
- Create: `apps/api/src/checklist/checklist.service.ts`, `apps/api/src/checklist/checklist.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/estimate/format-profile.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { categoriesForFormat, checklistKeysForFormat } from "./format-profile";

describe("format profiles (kamernaya anti-classic, §11.3)", () => {
  it("kamernaya drops host/big-banquet categories", () => {
    const all = ["banquet", "venue", "photo", "host", "decor", "dress", "music"];
    const kam = categoriesForFormat("kamernaya", all);
    expect(kam).not.toContain("host");
    expect(kam).toContain("photo");
  });
  it("zags keeps the classic category set", () => {
    const all = ["banquet", "venue", "photo", "host"];
    expect(categoriesForFormat("zags", all)).toEqual(all);
  });
  it("kamernaya swaps to a lighter checklist branch", () => {
    const keys = checklistKeysForFormat("kamernaya", "msk");
    expect(keys).not.toContain("book_host");
  });
});
```

- [ ] **Step 2: Запустить — FAIL → реализовать `apps/api/src/estimate/format-profile.ts`**

```ts
import type { WeddingFormat, City } from "@m/shared";

// §11.3: kamernaya removes тамада/выкуп/большой банкет-heavy items.
const KAMERNAYA_DROP = new Set(["host", "music"]);

export function categoriesForFormat(format: WeddingFormat, allSlugs: string[]): string[] {
  if (format === "kamernaya") return allSlugs.filter((s) => !KAMERNAYA_DROP.has(s));
  return allSlugs;
}

export function checklistKeysForFormat(format: WeddingFormat, city: City): string[] {
  const zags = city === "spb" ? ["zags_application_spb", "zags_docs_spb"] : ["zags_application_msk", "zags_docs_msk"];
  const base = [...zags, "buy_dress", "book_photo", "guest_list"];
  if (format === "kamernaya") return base; // no host
  return [...base, "book_host"];
}
```

Run: `pnpm --filter @m/api exec vitest run src/estimate/format-profile.test.ts` → PASS. Commit: `feat(api): format profiles for kamernaya re-shape`.

- [ ] **Step 3: Написать падающий тест `apps/api/src/checklist/checklist.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ChecklistService } from "./checklist.service";

function fakePrisma(templates: any[]) {
  return {
    weddingProject: { findUniqueOrThrow: vi.fn(async () => ({ id: "p1", city: "msk", format: "zags", weddingDate: new Date("2026-09-01") })) },
    checklistTemplate: { findMany: vi.fn(async () => templates) },
    checklistItem: { createMany: vi.fn(async () => ({ count: templates.length })), findMany: vi.fn(async () => []) },
  } as any;
}

describe("ChecklistService.instantiate", () => {
  it("creates items with due_date = wedding_date - offset and reminder_at", async () => {
    const prisma = fakePrisma([
      { key: "zags_application_msk", title: "Подать заявление", offsetDaysBeforeWedding: 35, city: "msk" },
      { key: "book_photo", title: "Фотограф", offsetDaysBeforeWedding: 180, city: null },
    ]);
    const svc = new ChecklistService(prisma);
    await svc.instantiate("p1");
    const call = prisma.checklistItem.createMany.mock.calls[0][0];
    const zags = call.data.find((d: any) => d.templateKey === "zags_application_msk");
    // 2026-09-01 minus 35 days = 2026-07-28
    expect(new Date(zags.dueDate).toISOString().slice(0, 10)).toBe("2026-07-28");
    expect(zags.reminderAt).toBeTruthy();
  });

  it("uses the format-specific checklist branch (kamernaya skips host)", async () => {
    const prisma = fakePrisma([{ key: "book_host", title: "Ведущий", offsetDaysBeforeWedding: 180, city: null }]);
    prisma.weddingProject.findUniqueOrThrow.mockResolvedValue({ id: "p1", city: "msk", format: "kamernaya", weddingDate: new Date("2026-09-01") });
    const svc = new ChecklistService(prisma);
    await svc.instantiate("p1");
    // book_host not requested for kamernaya → findMany called with keys excluding it
    const where = prisma.checklistTemplate.findMany.mock.calls[0][0].where;
    expect(where.key.in).not.toContain("book_host");
  });
});
```

- [ ] **Step 4: Запустить — FAIL → реализовать `apps/api/src/checklist/checklist.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { City, WeddingFormat } from "@m/shared";
import { checklistKeysForFormat } from "../estimate/format-profile";

const DAY_MS = 86400 * 1000;
const REMINDER_LEAD_DAYS = 3; // напомнить за 3 дня до due_date

@Injectable()
export class ChecklistService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async instantiate(projectId: string): Promise<void> {
    const project = await this.prisma.weddingProject.findUniqueOrThrow({ where: { id: projectId } });
    const keys = checklistKeysForFormat(project.format as WeddingFormat, project.city as City);
    const templates = await this.prisma.checklistTemplate.findMany({ where: { key: { in: keys } } });

    const data = templates.map((t) => {
      const dueDate = new Date(project.weddingDate.getTime() - t.offsetDaysBeforeWedding * DAY_MS);
      const reminderAt = new Date(dueDate.getTime() - REMINDER_LEAD_DAYS * DAY_MS);
      return { projectId, templateKey: t.key, title: t.title, dueDate, reminderAt };
    });
    await this.prisma.checklistItem.createMany({ data });
  }

  async list(projectId: string) {
    return this.prisma.checklistItem.findMany({ where: { projectId }, orderBy: { dueDate: "asc" } });
  }
}
```

Run: `pnpm --filter @m/api exec vitest run src/checklist/checklist.service.test.ts` → PASS. Commit: `feat(api): checklist instantiation by wedding_date with format branch`.

- [ ] **Step 5: Вызвать `ChecklistService.instantiate` из `ProjectService.createFromEstimate`.** Modify `apps/api/src/project/project.service.ts`: внедрить `ChecklistService`, после создания проекта вызвать `await this.checklist.instantiate(project.id)`. Обновить тест Task-3 Плана 2 (замокать checklist). Commit: `feat(api): instantiate checklist on project creation`.

---

## Task 10: Checklist-контроллер и модуль

**Files:**
- Create: `apps/api/src/checklist/checklist.controller.ts`, `apps/api/src/checklist/checklist.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Реализовать контроллер `apps/api/src/checklist/checklist.controller.ts`**

```ts
import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { ChecklistService } from "./checklist.service";
import { prisma } from "@m/db";

@Controller()
@UseGuards(JwtGuard)
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  @Get("projects/:id/checklist")
  list(@Param("id") projectId: string) { return this.checklist.list(projectId); }

  @Patch("checklist/:itemId")
  async patch(@Param("itemId") itemId: string, @Body() body: unknown) {
    const { done } = z.object({ done: z.boolean() }).parse(body);
    return prisma.checklistItem.update({ where: { id: itemId }, data: { done } });
  }
}
```

- [ ] **Step 2: Реализовать модуль `apps/api/src/checklist/checklist.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { ChecklistService } from "./checklist.service";
import { ChecklistController } from "./checklist.controller";

@Module({
  controllers: [ChecklistController],
  providers: [
    ChecklistService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
  exports: [ChecklistService],
})
export class ChecklistModule {}
```

- [ ] **Step 3: Подключить `ChecklistModule`. Typecheck + commit**

```bash
pnpm --filter @m/api typecheck
git add apps/api/src && git commit -m "feat(api): checklist controller (list + toggle done)"
```

---

## Task 11: Сквозная проверка Плана 3

- [ ] **Step 1: Типы и тесты**

Run: `pnpm turbo run typecheck test`
Expected: всё зелёное.

- [ ] **Step 2: Seed чеклиста и smoke**

Run:
```bash
pnpm --filter @m/db exec tsx prisma/seed-checklist.ts
```
Expected: «checklist seeded».

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: plan 3 done — budget tracker, delegation, checklist" || echo "nothing to commit"
```

---

## Self-Review (закрыто)

- **Spec coverage:** §5.2 (budget_items, payments), §5.3 (делегирование инвайт-токеном), §5.4 (чеклист по дате + reminder_at), §7 (LWW для не-финансов остаётся; финансы — optimistic lock), §11.3 (камерный режим), §11.7 (инвайт-токен: длинный/crypto/expiry/revoke/one-time), §12.6 (optimistic lock), §12.7 (recompute на платеже), §12.12 (ЗАГС compliance) — покрыты.
- **Out of plan (План 4):** постановка `reminder_at` в очередь BullMQ и доставка через бот, статусы доставки, fallback-view, 152-ФЗ consent/delete, as_of-refresh, integration-тесты крит. путей.
- **Type consistency:** `updateWithVersion` един для budget_items и payments; `SpendFactService.recompute(projectId, categoryId)` — сигнатура из Плана 2; `checklistKeysForFormat(format, city)` используется и в ChecklistService, и тестах; `reminderAt` пишется здесь, читается планировщиком напоминаний в Плане 4.

## Параметры
- TTL инвайта 7 дней (продлеваемый — повторный `create`); `REMINDER_LEAD_DAYS=3`; набор `KAMERNAYA_DROP` категорий.
