# План 2 — Acquisition-спина (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить смету из Плана 1 в виральную петлю и движок сбора данных (моат): share-карточка → публичный лендинг/витрина → сохранение проекта → сбор `spend_facts` → crowd-агрегаты, с честной маркировкой, rate-limit, кэшем и метриками.

**Architecture:** `apps/miniapp` (Next.js, app router) даёт UX внутри Telegram **и** публичные SSR-роуты `/showcase` и `/s/<preset>` (OG). Все агрегаты читаются через `BenchmarkReader` из Плана 1 (k-anon в одной точке). `spend_facts` — один факт на `(project, category)` (upsert). Crowd-агрегация считает перцентили с винзоризацией и пишет `price_benchmarks(source=crowd)`. Redis кэширует агрегаты и OG, плюс rate-limit анонимных эндпоинтов.

**Tech Stack:** Next.js 14 (app router, SSR), NestJS, Prisma, ioredis, BullMQ (агрегация-джоб), zod, vitest. Опирается на План 1.

**Источник правды:** спек §5.1–§5.2, §6, §11.1, §11.2, §11.8, §12.1, §12.4, §12.7, §12.8, §12.10.

---

## File Structure

```
apps/
├── api/src/
│   ├── project/
│   │   ├── project.service.ts        # create project from estimate (save-as-budget)
│   │   ├── project.controller.ts     # POST /projects (auth)
│   │   └── project.module.ts
│   ├── spend/
│   │   ├── spend-fact.service.ts     # upsert one fact per (project,category)  [T6]
│   │   └── spend-fact.service.test.ts
│   ├── aggregation/
│   │   ├── winsorize.ts              # outlier trim
│   │   ├── crowd-aggregator.ts       # percentiles → price_benchmarks(crowd)
│   │   └── aggregation.module.ts     # BullMQ queue + worker
│   ├── showcase/
│   │   ├── showcase.service.ts       # public aggregates via BenchmarkReader (cached)
│   │   ├── showcase.controller.ts    # GET /public/showcase, GET /public/preset/:p
│   │   └── showcase.module.ts
│   ├── cache/redis-cache.ts          # ioredis wrapper (get/set TTL)
│   ├── ratelimit/rate-limit.guard.ts # Redis fixed-window limiter  [T8]
│   ├── metrics/metrics.service.ts    # counters (11.8)
│   └── auth/jwt.guard.ts             # session guard for authed routes
└── miniapp/
    ├── package.json
    ├── next.config.mjs
    ├── app/
    │   ├── page.tsx                  # Mini App estimate UX (inside Telegram)
    │   ├── showcase/page.tsx         # public SSR showcase
    │   └── s/[preset]/page.tsx       # OG share landing (SSR, generateMetadata)
    └── lib/api.ts                    # fetch helpers to apps/api
```

---

## Task 1: Redis-обёртка кэша

**Files:**
- Create: `apps/api/src/cache/redis-cache.ts`, `apps/api/src/cache/redis-cache.test.ts`
- Modify: `apps/api/package.json` (add `ioredis`)

- [ ] **Step 1: Добавить зависимость**

Run: `pnpm --filter @m/api add ioredis`

- [ ] **Step 2: Написать падающий тест `apps/api/src/cache/redis-cache.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { RedisCache } from "./redis-cache";

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return "OK"; }),
  } as any;
}

describe("RedisCache.getOrSet", () => {
  it("computes and caches on miss, returns cached on hit", async () => {
    const redis = fakeRedis();
    const cache = new RedisCache(redis);
    const compute = vi.fn(async () => ({ n: 1 }));
    const a = await cache.getOrSet("k", 600, compute);
    const b = await cache.getOrSet("k", 600, compute);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(compute).toHaveBeenCalledTimes(1); // second call served from cache
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api exec vitest run src/cache/redis-cache.test.ts`
Expected: FAIL.

- [ ] **Step 4: Реализовать `apps/api/src/cache/redis-cache.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type Redis from "ioredis";

@Injectable()
export class RedisCache {
  constructor(@Inject("REDIS") private readonly redis: Redis) {}

  async getOrSet<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
    const hit = await this.redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
    const value = await compute();
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSec);
    return value;
  }

  async del(key: string): Promise<void> { await (this.redis as any).del(key); }
}
```

- [ ] **Step 5: Запустить — PASS, затем commit**

Run: `pnpm --filter @m/api exec vitest run src/cache/redis-cache.test.ts`
```bash
git add apps/api/src/cache apps/api/package.json
git commit -m "feat(api): Redis cache getOrSet wrapper"
```

---

## Task 2: JWT-guard для аутентифицированных роутов

**Files:**
- Create: `apps/api/src/auth/jwt.guard.ts`, `apps/api/src/auth/jwt.guard.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/auth/jwt.guard.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { JwtGuard } from "./jwt.guard";
import { signSession } from "./jwt";

const SECRET = "s";
function ctx(authHeader?: string) {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }), } as any;
}

describe("JwtGuard", () => {
  const guard = new JwtGuard({ jwtSecret: SECRET } as any);
  it("allows a valid token and attaches userId", () => {
    const token = signSession({ userId: "u1" }, SECRET, { ttlSec: 3600 });
    const c = ctx(`Bearer ${token}`);
    expect(guard.canActivate(c)).toBe(true);
    expect(c.switchToHttp().getRequest().userId).toBe("u1");
  });
  it("rejects missing token", () => {
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/auth/jwt.guard.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/auth/jwt.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException } from "@nestjs/common";
import { verifySession, SessionExpiredError } from "./jwt";

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(@Inject("AUTH_CONFIG") private readonly config: { jwtSecret: string }) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("missing token");
    try {
      const claims = verifySession(header.slice(7), this.config.jwtSecret);
      req.userId = claims.userId;
      return true;
    } catch (e) {
      if (e instanceof SessionExpiredError) throw new UnauthorizedException("session expired");
      throw new UnauthorizedException("invalid token");
    }
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/auth/jwt.guard.test.ts
git add apps/api/src/auth && git commit -m "feat(api): JwtGuard for authenticated routes"
```

---

## Task 3: Создание проекта из сметы (save-as-budget, §5.1.5, §3.Мост)

**Files:**
- Create: `apps/api/src/project/project.service.ts`, `apps/api/src/project/project.controller.ts`, `apps/api/src/project/project.module.ts`, `apps/api/src/project/project.service.test.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/project/project.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ProjectService } from "./project.service";

const created: any[] = [];
const fakePrisma = {
  $transaction: async (fn: any) => fn(fakePrisma),
  weddingProject: { create: vi.fn(async ({ data }: any) => { const p = { id: "p1", ...data }; created.push(p); return p; }) },
  projectMember: { create: vi.fn(async () => ({})) },
  category: { findMany: vi.fn(async () => [{ id: "c1", slug: "banquet" }, { id: "c2", slug: "photo" }]) },
  budgetItem: { createMany: vi.fn(async () => ({ count: 2 })) },
} as any;

describe("ProjectService.createFromEstimate", () => {
  it("creates project, owner membership, and budget items per estimate line", async () => {
    const svc = new ProjectService(fakePrisma);
    const res = await svc.createFromEstimate("u1", {
      city: "msk", format: "zags", tier: "mid", guests: 80, weddingDate: "2026-09-01",
      lines: [
        { categorySlug: "banquet", plannedAmount: "40000000" },
        { categorySlug: "photo", plannedAmount: "8000000" },
      ],
    });
    expect(res.projectId).toBe("p1");
    expect(fakePrisma.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "owner", userId: "u1" }) }),
    );
    expect(fakePrisma.budgetItem.createMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/project/project.service.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/project/project.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";

export interface CreateProjectInput {
  city: string; format: string; tier: string; guests: number; weddingDate: string;
  lines: { categorySlug: string; plannedAmount: string }[]; // kopecks as string
}

@Injectable()
export class ProjectService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async createFromEstimate(userId: string, input: CreateProjectInput): Promise<{ projectId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.weddingProject.create({
        data: {
          ownerId: userId, city: input.city, weddingDate: new Date(input.weddingDate),
          format: input.format, guestCount: input.guests, tier: input.tier,
        },
      });
      await tx.projectMember.create({ data: { projectId: project.id, userId, role: "owner" } });
      const categories = await tx.category.findMany({ where: { slug: { in: input.lines.map((l) => l.categorySlug) } } });
      const idBySlug = new Map(categories.map((c) => [c.slug, c.id]));
      await tx.budgetItem.createMany({
        data: input.lines.flatMap((l) => {
          const categoryId = idBySlug.get(l.categorySlug);
          return categoryId ? [{ projectId: project.id, categoryId, plannedAmount: BigInt(l.plannedAmount) }] : [];
        }),
      });
      return { projectId: project.id };
    });
  }
}
```

- [ ] **Step 4: Реализовать контроллер `apps/api/src/project/project.controller.ts`**

```ts
import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { ProjectService } from "./project.service";

const CreateProjectSchema = z.object({
  city: z.string(), format: z.string(), tier: z.string(),
  guests: z.number().int().min(1), weddingDate: z.string(),
  lines: z.array(z.object({ categorySlug: z.string(), plannedAmount: z.string() })),
});

@Controller("projects")
@UseGuards(JwtGuard)
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const input = CreateProjectSchema.parse(body);
    return this.projects.createFromEstimate(req.userId, input);
  }
}
```

- [ ] **Step 5: Реализовать модуль `apps/api/src/project/project.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";

@Module({
  controllers: [ProjectController],
  providers: [
    ProjectService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
```

- [ ] **Step 6: Подключить в `app.module.ts`** (добавить `ProjectModule` в `imports`).

- [ ] **Step 7: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/project/project.service.test.ts
git add apps/api/src && git commit -m "feat(api): create project from estimate (save-as-budget)"
```

---

## Task 4: `SpendFactService` — один факт на (project, category) [T6, §12.7]

**Files:**
- Create: `apps/api/src/spend/spend-fact.service.ts`, `apps/api/src/spend/spend-fact.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/spend/spend-fact.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { SpendFactService } from "./spend-fact.service";

function fakePrisma() {
  return {
    payment: { aggregate: vi.fn() },
    weddingProject: { findUniqueOrThrow: vi.fn(async () => ({ city: "msk", tier: "mid", format: "zags", guestCount: 80 })) },
    budgetItem: { findUniqueOrThrow: vi.fn(async () => ({ projectId: "p1", categoryId: "c1" })) },
    spendFact: { upsert: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 1 })) },
  } as any;
}

describe("SpendFactService", () => {
  it("upserts ONE fact per (project, category) using summed payments", async () => {
    const prisma = fakePrisma();
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 42000000n } });
    const svc = new SpendFactService(prisma);
    await svc.recompute("p1", "c1");
    expect(prisma.spendFact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_categoryId: { projectId: "p1", categoryId: "c1" } },
        create: expect.objectContaining({ amount: 42000000n, projectId: "p1", categoryId: "c1" }),
      }),
    );
  });

  it("deletes the fact when summed payments are zero/none", async () => {
    const prisma = fakePrisma();
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const svc = new SpendFactService(prisma);
    await svc.recompute("p1", "c1");
    expect(prisma.spendFact.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", categoryId: "c1" } });
    expect(prisma.spendFact.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/spend/spend-fact.service.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/spend/spend-fact.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";

/**
 * §12.7: exactly one spend_fact per (project, category). Recompute from the
 * summed payments of all budget_items in that category. project_id is stored
 * for upsert/delete only and is EXCLUDED from aggregates (Plan 2 crowd query).
 */
@Injectable()
export class SpendFactService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async recompute(projectId: string, categoryId: string): Promise<void> {
    const sum = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: { budgetItem: { projectId, categoryId } },
    });
    const total = sum._sum.amount;
    if (!total || total <= 0n) {
      await this.prisma.spendFact.deleteMany({ where: { projectId, categoryId } });
      return;
    }
    const project = await this.prisma.weddingProject.findUniqueOrThrow({ where: { id: projectId } });
    await this.prisma.spendFact.upsert({
      where: { projectId_categoryId: { projectId, categoryId } },
      update: { amount: total, city: project.city, tier: project.tier, format: project.format, guestCount: project.guestCount },
      create: {
        projectId, categoryId, amount: total,
        city: project.city, tier: project.tier, format: project.format, guestCount: project.guestCount,
      },
    });
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/spend/spend-fact.service.test.ts
git add apps/api/src/spend && git commit -m "feat(api): idempotent spend_fact upsert per project+category"
```

---

## Task 5: Винзоризация выбросов (§6)

**Files:**
- Create: `apps/api/src/aggregation/winsorize.ts`, `apps/api/src/aggregation/winsorize.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/aggregation/winsorize.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { winsorize, percentiles } from "./winsorize";

describe("winsorize", () => {
  it("clamps extreme outliers to the 5th/95th percentile", () => {
    const xs = [10n, 12n, 11n, 13n, 12n, 1000000n]; // one absurd outlier
    const w = winsorize(xs, 0.05);
    expect(Math.max(...w.map(Number))).toBeLessThan(1000000);
  });
  it("drops zeros and negatives", () => {
    expect(winsorize([0n, -5n, 10n, 12n], 0.05).every((x) => x > 0n)).toBe(true);
  });
});

describe("percentiles", () => {
  it("computes p25/median/p75", () => {
    const p = percentiles([10n, 20n, 30n, 40n, 50n]);
    expect(p.median).toBe(30n);
    expect(p.p25).toBe(20n);
    expect(p.p75).toBe(40n);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/aggregation/winsorize.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/aggregation/winsorize.ts`**

```ts
/** Drop non-positive values, then clamp the lowest/highest `frac` to the percentile bounds. */
export function winsorize(values: bigint[], frac: number): bigint[] {
  const clean = values.filter((v) => v > 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (clean.length === 0) return [];
  const loIdx = Math.floor(clean.length * frac);
  const hiIdx = Math.ceil(clean.length * (1 - frac)) - 1;
  const lo = clean[Math.min(loIdx, clean.length - 1)]!;
  const hi = clean[Math.max(hiIdx, 0)]!;
  return clean.map((v) => (v < lo ? lo : v > hi ? hi : v));
}

function quantile(sorted: bigint[], q: number): bigint {
  if (sorted.length === 0) return 0n;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[idx]!;
}

export function percentiles(values: bigint[]): { p25: bigint; median: bigint; p75: bigint } {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { p25: quantile(sorted, 0.25), median: quantile(sorted, 0.5), p75: quantile(sorted, 0.75) };
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/aggregation/winsorize.test.ts
git add apps/api/src/aggregation && git commit -m "feat(api): winsorize + percentiles for crowd aggregation"
```

---

## Task 6: `CrowdAggregator` — пересчёт crowd-бенчмарков (§6)

**Files:**
- Create: `apps/api/src/aggregation/crowd-aggregator.ts`, `apps/api/src/aggregation/crowd-aggregator.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/aggregation/crowd-aggregator.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { CrowdAggregator } from "./crowd-aggregator";

function fakePrisma(facts: any[]) {
  return {
    spendFact: { findMany: vi.fn(async () => facts) },
    category: { findFirst: vi.fn(async () => ({ id: "c1" })) },
    priceBenchmark: { upsert: vi.fn(async () => ({})) },
  } as any;
}

describe("CrowdAggregator.recomputeSlice", () => {
  it("writes a crowd benchmark with winsorized percentiles and sampleCount", async () => {
    const facts = Array.from({ length: 6 }, (_, i) => ({ amount: BigInt((i + 1) * 100000), categoryId: "c1" }));
    const prisma = fakePrisma(facts);
    const agg = new CrowdAggregator(prisma);
    await agg.recomputeSlice({ categorySlug: "banquet", city: "msk", tier: "mid", format: "zags" });
    expect(prisma.priceBenchmark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId_city_tier_source: { categoryId: "c1", city: "msk", tier: "mid", source: "crowd" } },
        create: expect.objectContaining({ source: "crowd", sampleCount: 6 }),
      }),
    );
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/aggregation/crowd-aggregator.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/aggregation/crowd-aggregator.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { winsorize, percentiles } from "./winsorize";

export interface SliceKey { categorySlug: string; city: string; tier: string; format: string; }

@Injectable()
export class CrowdAggregator {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async recomputeSlice(key: SliceKey): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { slug: key.categorySlug } });
    if (!category) return;
    const facts = await this.prisma.spendFact.findMany({
      where: { categoryId: category.id, city: key.city, tier: key.tier, format: key.format },
      select: { amount: true },
    });
    const cleaned = winsorize(facts.map((f) => f.amount), 0.05);
    const { p25, median, p75 } = percentiles(cleaned);
    await this.prisma.priceBenchmark.upsert({
      where: { categoryId_city_tier_source: { categoryId: category.id, city: key.city, tier: key.tier, source: "crowd" } },
      update: { p25, median, p75, sampleCount: cleaned.length, asOfYear: null },
      create: { categoryId: category.id, city: key.city, tier: key.tier, source: "crowd", p25, median, p75, sampleCount: cleaned.length, asOfYear: null },
    });
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/aggregation/crowd-aggregator.test.ts
git add apps/api/src/aggregation && git commit -m "feat(api): crowd aggregator writes winsorized percentile benchmarks"
```

---

## Task 7: BullMQ-очередь агрегации (триггер по spend_fact / ночью)

**Files:**
- Create: `apps/api/src/aggregation/aggregation.module.ts`, `apps/api/src/aggregation/aggregation.queue.ts`
- Modify: `apps/api/package.json` (add `bullmq`)

- [ ] **Step 1: Добавить зависимость**

Run: `pnpm --filter @m/api add bullmq`

- [ ] **Step 2: Реализовать очередь `apps/api/src/aggregation/aggregation.queue.ts`**

```ts
import { Queue, Worker } from "bullmq";
import type { SliceKey } from "./crowd-aggregator";

export const AGG_QUEUE = "crowd-aggregation";

export function makeAggregationQueue(connectionUrl: string): Queue<SliceKey> {
  const url = new URL(connectionUrl);
  return new Queue<SliceKey>(AGG_QUEUE, { connection: { host: url.hostname, port: Number(url.port || 6379) } });
}

export function makeAggregationWorker(connectionUrl: string, handler: (key: SliceKey) => Promise<void>): Worker<SliceKey> {
  const url = new URL(connectionUrl);
  return new Worker<SliceKey>(AGG_QUEUE, async (job) => handler(job.data), {
    connection: { host: url.hostname, port: Number(url.port || 6379) },
  });
}
```

- [ ] **Step 3: Реализовать модуль `apps/api/src/aggregation/aggregation.module.ts`**

```ts
import { Module, OnModuleInit, OnModuleDestroy, Inject } from "@nestjs/common";
import { prisma } from "@m/db";
import { CrowdAggregator } from "./crowd-aggregator";
import { makeAggregationQueue, makeAggregationWorker } from "./aggregation.queue";
import type { Queue, Worker } from "bullmq";
import type { SliceKey } from "./crowd-aggregator";

@Module({
  providers: [
    CrowdAggregator,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AGG_QUEUE", useFactory: () => makeAggregationQueue(process.env.REDIS_URL ?? "redis://localhost:6379") },
  ],
  exports: ["AGG_QUEUE"],
})
export class AggregationModule implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<SliceKey>;
  constructor(private readonly aggregator: CrowdAggregator, @Inject("AGG_QUEUE") private readonly queue: Queue<SliceKey>) {}
  onModuleInit() {
    this.worker = makeAggregationWorker(process.env.REDIS_URL ?? "redis://localhost:6379", (key) => this.aggregator.recomputeSlice(key));
  }
  async onModuleDestroy() { await this.worker?.close(); await this.queue.close(); }
}
```

- [ ] **Step 4: Commit** (очередь без unit-теста — интеграция проверяется в Плане 4 e2e; здесь только typecheck)

```bash
pnpm --filter @m/api typecheck
git add apps/api/src/aggregation apps/api/package.json
git commit -m "feat(api): BullMQ crowd-aggregation queue + worker"
```

- [ ] **Step 5: Связать spend → enqueue.** В `SpendFactService.recompute` после upsert добавить enqueue среза. Modify `apps/api/src/spend/spend-fact.service.ts` — внедрить `@Inject("AGG_QUEUE") queue` и после upsert: `await this.queue.add("slice", { categorySlug: <slug>, city, tier, format })` (slug получить из `category.findUnique`). Обновить тест Task 4: замокать `queue.add` и проверить вызов. Commit: `feat(api): enqueue crowd recompute after spend_fact change`.

---

## Task 8: `ShowcaseService` — публичные агрегаты через BenchmarkReader + кэш [§12.2, §12.10]

**Files:**
- Create: `apps/api/src/showcase/showcase.service.ts`, `apps/api/src/showcase/showcase.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/showcase/showcase.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ShowcaseService } from "./showcase.service";

describe("ShowcaseService.cityShowcase", () => {
  it("reads aggregates via BenchmarkReader and caches the result", async () => {
    const reader = { getAggregates: vi.fn(async (_s: any, slugs: string[]) =>
      new Map(slugs.map((s) => [s, { categorySlug: s, source: "seed", p25: 1n, median: 2n, p75: 3n, sampleCount: 0, asOfYear: 2026 }]))) } as any;
    const cache = { getOrSet: vi.fn(async (_k: string, _t: number, fn: any) => fn()) } as any;
    const prisma = { category: { findMany: async () => [{ slug: "banquet", unit: "per_guest" }] } } as any;
    const svc = new ShowcaseService(reader, cache, prisma);
    const res = await svc.cityShowcase({ city: "msk", tier: "mid", format: "zags" });
    expect(res.items[0]?.categorySlug).toBe("banquet");
    expect(cache.getOrSet).toHaveBeenCalled();
    expect(reader.getAggregates).toHaveBeenCalledTimes(1); // batched, single read
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/showcase/showcase.service.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/showcase/showcase.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { BenchmarkReader, type Slice } from "../estimate/benchmark-reader";
import { RedisCache } from "../cache/redis-cache";

export interface ShowcaseItem { categorySlug: string; source: "seed" | "crowd"; median: string; p25: string; p75: string; sampleCount: number; }
export interface ShowcaseResult { items: ShowcaseItem[]; }

@Injectable()
export class ShowcaseService {
  constructor(
    private readonly reader: BenchmarkReader,
    private readonly cache: RedisCache,
    @Inject("PRISMA") private readonly prisma: PrismaClient,
  ) {}

  async cityShowcase(slice: Slice): Promise<ShowcaseResult> {
    const key = `showcase:${slice.city}:${slice.tier}:${slice.format}`;
    return this.cache.getOrSet(key, 600, async () => {
      const categories = await this.prisma.category.findMany({ orderBy: { sort: "asc" } });
      const aggs = await this.reader.getAggregates(slice, categories.map((c) => c.slug));
      const items: ShowcaseItem[] = [];
      for (const c of categories) {
        const a = aggs.get(c.slug);
        if (!a || "insufficient" in a) continue;
        items.push({ categorySlug: c.slug, source: a.source, median: a.median.toString(), p25: a.p25.toString(), p75: a.p75.toString(), sampleCount: a.sampleCount });
      }
      return { items };
    });
  }
}
```

- [ ] **Step 4: PASS + commit**

```bash
pnpm --filter @m/api exec vitest run src/showcase/showcase.service.test.ts
git add apps/api/src/showcase && git commit -m "feat(api): ShowcaseService reads cached aggregates via BenchmarkReader"
```

---

## Task 9: Rate-limit guard для анонимных эндпоинтов [T8, §12.8]

**Files:**
- Create: `apps/api/src/ratelimit/rate-limit.guard.ts`, `apps/api/src/ratelimit/rate-limit.guard.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/ratelimit/rate-limit.guard.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { HttpException } from "@nestjs/common";
import { RateLimitGuard } from "./rate-limit.guard";

function fakeRedis() {
  const store = new Map<string, number>();
  return {
    incr: async (k: string) => { const n = (store.get(k) ?? 0) + 1; store.set(k, n); return n; },
    expire: async () => 1,
  } as any;
}
function ctx(ip: string) {
  const req: any = { ip, headers: {}, route: { path: "/estimate" } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe("RateLimitGuard", () => {
  it("allows up to the limit then throws 429", async () => {
    const guard = new RateLimitGuard(fakeRedis(), { limit: 3, windowSec: 60 });
    const c = ctx("1.2.3.4");
    expect(await guard.canActivate(c)).toBe(true);
    expect(await guard.canActivate(c)).toBe(true);
    expect(await guard.canActivate(c)).toBe(true);
    await expect(guard.canActivate(c)).rejects.toBeInstanceOf(HttpException);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/ratelimit/rate-limit.guard.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/ratelimit/rate-limit.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import type Redis from "ioredis";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject("REDIS") private readonly redis: Redis,
    @Inject("RATELIMIT_CONFIG") private readonly config: { limit: number; windowSec: number },
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip ?? req.headers?.["x-forwarded-for"] ?? "unknown";
    const path = req.route?.path ?? req.url ?? "?";
    const windowId = Math.floor(Date.now() / 1000 / this.config.windowSec);
    const key = `rl:${path}:${ip}:${windowId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, this.config.windowSec);
    if (count > this.config.limit) throw new HttpException("rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }
}
```

- [ ] **Step 4: PASS, навесить guard на анонимные роуты**

Применить `@UseGuards(RateLimitGuard)` к `EstimateController` и публичным showcase/OG-роутам (Task 10). Зарегистрировать провайдеры `"REDIS"` (ioredis на `REDIS_URL`) и `"RATELIMIT_CONFIG"` (`{ limit: 30, windowSec: 60 }`) в соответствующих модулях.

```bash
pnpm --filter @m/api exec vitest run src/ratelimit/rate-limit.guard.test.ts
git add apps/api/src && git commit -m "feat(api): Redis fixed-window rate-limit guard for anon endpoints"
```

---

## Task 10: Публичные роуты showcase + preset (OG-данные) и модуль

**Files:**
- Create: `apps/api/src/showcase/showcase.controller.ts`, `apps/api/src/showcase/showcase.module.ts`, `apps/api/test/showcase.e2e.test.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий e2e-тест `apps/api/test/showcase.e2e.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { prisma } from "@m/db";
import { seed } from "../../../packages/db/prisma/seed";

let app: INestApplication;
beforeAll(async () => {
  await seed();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterAll(async () => { await app.close(); await prisma.$disconnect(); });

describe("GET /public/showcase", () => {
  it("returns seed aggregates publicly (no auth), with Cache-Control", async () => {
    const res = await request(app.getHttpServer()).get("/public/showcase?city=msk&tier=mid&format=zags");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.headers["cache-control"]).toContain("s-maxage");
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run test/showcase.e2e.test.ts`

- [ ] **Step 3: Реализовать контроллер `apps/api/src/showcase/showcase.controller.ts`**

```ts
import { Controller, Get, Query, Header, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { CITIES, TIERS, FORMATS } from "@m/shared";
import { ShowcaseService } from "./showcase.service";

const SliceQuery = z.object({ city: z.enum(CITIES), tier: z.enum(TIERS), format: z.enum(FORMATS) });

@Controller("public")
export class ShowcaseController {
  constructor(private readonly showcase: ShowcaseService) {}

  @Get("showcase")
  @Header("Cache-Control", "public, s-maxage=600, stale-while-revalidate=60")
  async show(@Query() q: unknown) {
    const parsed = SliceQuery.safeParse(q);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.showcase.cityShowcase(parsed.data);
  }
}
```

- [ ] **Step 4: Реализовать модуль `apps/api/src/showcase/showcase.module.ts`**

```ts
import { Module } from "@nestjs/common";
import Redis from "ioredis";
import { prisma } from "@m/db";
import { BenchmarkReader } from "../estimate/benchmark-reader";
import { RedisCache } from "../cache/redis-cache";
import { ShowcaseService } from "./showcase.service";
import { ShowcaseController } from "./showcase.controller";

@Module({
  controllers: [ShowcaseController],
  providers: [
    BenchmarkReader, RedisCache, ShowcaseService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "BENCHMARK_CONFIG", useValue: { threshold: Number(process.env.N_THRESHOLD ?? 5) } },
    { provide: "REDIS", useFactory: () => new Redis(process.env.REDIS_URL ?? "redis://localhost:6379") },
  ],
})
export class ShowcaseModule {}
```

- [ ] **Step 5: Подключить `ShowcaseModule` в `app.module.ts`. PASS + commit**

```bash
pnpm --filter @m/api exec vitest run test/showcase.e2e.test.ts
git add apps/api/src && git commit -m "feat(api): public /public/showcase route with cache headers"
```

---

## Task 11: Метрики (§11.8)

**Files:**
- Create: `apps/api/src/metrics/metrics.service.ts`, `apps/api/src/metrics/metrics.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/metrics/metrics.service.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  it("counts named events and exposes a snapshot", () => {
    const m = new MetricsService();
    m.inc("estimate_share");
    m.inc("estimate_share");
    m.inc("project_saved");
    expect(m.snapshot()).toEqual({ estimate_share: 2, project_saved: 1 });
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @m/api exec vitest run src/metrics/metrics.service.test.ts`

- [ ] **Step 3: Реализовать `apps/api/src/metrics/metrics.service.ts`**

```ts
import { Injectable } from "@nestjs/common";

// Минимальный in-process счётчик (§11.8). Позже можно экспортировать в Prometheus.
@Injectable()
export class MetricsService {
  private counters = new Map<string, number>();
  inc(name: string, by = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + by); }
  snapshot(): Record<string, number> { return Object.fromEntries(this.counters); }
}
```

- [ ] **Step 4: PASS + commit.** Инкрементировать `estimate_share`, `project_saved`, `spend_fact_written` в соответствующих сервисах (внедрить `MetricsService` как provider).

```bash
pnpm --filter @m/api exec vitest run src/metrics/metrics.service.test.ts
git add apps/api/src/metrics && git commit -m "feat(api): in-process metrics counters (11.8)"
```

---

## Task 12: `apps/miniapp` — каркас Next.js + UX сметы

**Files:**
- Create: `apps/miniapp/package.json`, `apps/miniapp/next.config.mjs`, `apps/miniapp/tsconfig.json`, `apps/miniapp/lib/api.ts`, `apps/miniapp/app/layout.tsx`, `apps/miniapp/app/page.tsx`

- [ ] **Step 1: Создать `apps/miniapp/package.json`**

```json
{
  "name": "@m/miniapp",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.2.0", "react": "^18.3.0", "react-dom": "^18.3.0", "@m/shared": "workspace:*"
  },
  "devDependencies": { "typescript": "^5.5.0", "@types/react": "^18.3.0", "@types/node": "^20.14.0" }
}
```

- [ ] **Step 2: Создать `apps/miniapp/next.config.mjs` и `tsconfig.json`**

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
export default { env: { API_URL: process.env.API_URL ?? "http://localhost:3001" } };
```
`tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "preserve", "module": "ESNext", "moduleResolution": "Bundler", "noEmit": true, "plugins": [{ "name": "next" }] }, "include": ["app", "lib", "next-env.d.ts"] }
```

- [ ] **Step 3: Создать `apps/miniapp/lib/api.ts`**

```ts
const API = process.env.API_URL ?? "http://localhost:3001";

export async function fetchEstimate(body: { city: string; format: string; tier: string; guests: number }) {
  const res = await fetch(`${API}/estimate`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`estimate failed: ${res.status}`);
  return res.json();
}

export async function fetchShowcase(slice: { city: string; tier: string; format: string }) {
  const res = await fetch(`${API}/public/showcase?city=${slice.city}&tier=${slice.tier}&format=${slice.format}`, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`showcase failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Создать `apps/miniapp/app/layout.tsx` и `app/page.tsx`**

`layout.tsx`:
```tsx
export const metadata = { title: "m-planner — смета свадьбы" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="ru"><body>{children}</body></html>);
}
```
`page.tsx` (клиентский экран сметы с кнопкой «Поделиться»):
```tsx
"use client";
import { useState } from "react";
import { fetchEstimate } from "../lib/api";
import { formatRub, type Money } from "@m/shared";

export default function Home() {
  const [guests, setGuests] = useState(80);
  const [result, setResult] = useState<any>(null);
  const slice = { city: "msk", format: "zags", tier: "mid" };

  async function run() { setResult(await fetchEstimate({ ...slice, guests })); }
  const shareUrl = `${process.env.API_URL ?? ""}`.replace(/:3001$/, ":3000") +
    `/s/${slice.city}_${slice.format}_${slice.tier}_${guests}`;

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Смета свадьбы в Москве</h1>
      <label>Гостей: <input type="number" value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></label>
      <button onClick={run}>Посчитать</button>
      {result && (
        <>
          <h2>{formatRub(BigInt(result.totalMid) as Money)} (диапазон {formatRub(BigInt(result.totalLow) as Money)}–{formatRub(BigInt(result.totalHigh) as Money)})</h2>
          <ul>{result.lines.map((l: any) => (
            <li key={l.categorySlug}>{l.categorySlug}: {formatRub(BigInt(l.mid) as Money)} <small>({l.label})</small></li>
          ))}</ul>
          <a href={shareUrl}>Поделиться</a>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Установить, typecheck, smoke-build**

Run:
```bash
pnpm install
pnpm --filter @m/miniapp build
```
Expected: Next.js собирает приложение без ошибок типов.

- [ ] **Step 6: Commit**

```bash
git add apps/miniapp pnpm-lock.yaml
git commit -m "feat(miniapp): Next.js scaffold + estimate UX with share link"
```

---

## Task 13: Публичные SSR-роуты `/showcase` и `/s/<preset>` (OG) [T1, §12.1]

**Files:**
- Create: `apps/miniapp/app/showcase/page.tsx`, `apps/miniapp/app/s/[preset]/page.tsx`

- [ ] **Step 1: Создать `apps/miniapp/app/showcase/page.tsx` (SSR, индексируемая витрина)**

```tsx
import { fetchShowcase } from "../../lib/api";
import { formatRub, type Money } from "@m/shared";

export const dynamic = "force-dynamic"; // SSR; кэш — на стороне API (Cache-Control)

export default async function ShowcasePage() {
  const data = await fetchShowcase({ city: "msk", tier: "mid", format: "zags" });
  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Сметы свадеб в Москве</h1>
      <ul>
        {data.items.map((it: any) => (
          <li key={it.categorySlug}>
            {it.categorySlug}: {formatRub(BigInt(it.median) as Money)}{" "}
            <small>{it.source === "crowd" ? `по ${it.sampleCount} реальным свадьбам` : "ориентир (2026)"}</small>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Создать `apps/miniapp/app/s/[preset]/page.tsx` (OG-лендинг с `generateMetadata`)**

```tsx
import type { Metadata } from "next";
import { fetchEstimate } from "../../../lib/api";
import { formatRub, type Money } from "@m/shared";

// preset формат: city_format_tier_guests, напр. "msk_zags_mid_80"
function parsePreset(preset: string) {
  const [city, format, tier, guests] = preset.split("_");
  return { city, format, tier, guests: Number(guests) };
}

export async function generateMetadata({ params }: { params: { preset: string } }): Promise<Metadata> {
  const p = parsePreset(params.preset);
  const est = await fetchEstimate(p);
  const total = formatRub(BigInt(est.totalMid) as Money);
  const title = `Смета свадьбы в Москве: ~${total}`;
  return {
    title,
    openGraph: { title, description: `Рассчитай свою смету в Telegram`, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function PresetLanding({ params }: { params: { preset: string } }) {
  const p = parsePreset(params.preset);
  const est = await fetchEstimate(p);
  const botUrl = `https://t.me/${process.env.BOT_USERNAME ?? "mplanner_bot"}?startapp=preset_${params.preset}`;
  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Смета свадьбы в Москве: ~{formatRub(BigInt(est.totalMid) as Money)}</h1>
      <p>{p.guests} гостей · {p.format}</p>
      <a href={botUrl}>Открыть в Telegram</a>
    </main>
  );
}
```

- [ ] **Step 3: Smoke-build**

Run: `pnpm --filter @m/miniapp build`
Expected: оба роута собраны (`/showcase`, `/s/[preset]`).

- [ ] **Step 4: Commit**

```bash
git add apps/miniapp/app
git commit -m "feat(miniapp): public SSR /showcase and OG /s/<preset> landing"
```

---

## Task 14: Сквозная проверка Плана 2

- [ ] **Step 1: Типы и тесты**

Run: `pnpm turbo run typecheck test`
Expected: всё зелёное.

- [ ] **Step 2: Smoke — публичная витрина**

Run:
```bash
pnpm --filter @m/api dev & sleep 3
curl -s "localhost:3001/public/showcase?city=msk&tier=mid&format=zags" -i | head -20
```
Expected: 200, заголовок `Cache-Control: ... s-maxage=600`, тело с `items`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: plan 2 done — acquisition spine works" || echo "nothing to commit"
```

---

## Self-Review (закрыто)

- **Spec coverage:** §5.1.5 (save-as-budget), §5.2.3 (spend_fact при платеже — сервис готов, привязка к платежу в Плане 3), §6 (винзоризация, перцентили, crowd-бенчмарки, очередь), §11.1 (share-ссылка/OG), §11.2 (витрина), §11.8 (метрики), §12.1/12.2/12.4/12.7/12.8/12.10 — покрыты.
- **Out of plan (дальше):** ввод платежей и привязка `recompute` к платежу (План 3), optimistic lock (План 3), напоминания (План 4).
- **Type consistency:** `Slice`/`Aggregate` из `benchmark-reader.ts` (План 1); `SpendFactService.recompute(projectId, categoryId)` — та же сигнатура используется в Плане 3 после ввода платежа; `ShowcaseItem.source` совпадает с маркировкой §12.4.

## Параметры
- Кэш TTL витрины 600с; rate-limit 30/60с (env-настраиваемо); preset-формат `city_format_tier_guests`.
