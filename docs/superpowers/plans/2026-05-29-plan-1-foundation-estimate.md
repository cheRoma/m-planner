# План 1 — Фундамент + вертикальный срез «Смета» (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять монорепо и собрать работающую анонимную ₽-смету за 2 минуты (Фаза 0): ввод `city/format/guests/tier` → диапазон p25–p75 по категориям с честной маркировкой seed/crowd.

**Architecture:** pnpm + Turborepo монорепо на TypeScript. `apps/api` (NestJS) держит домен; `packages/shared` — типы и zod-схемы (включая `Money`); `packages/db` — Prisma-схема и миграции. Единственная точка чтения бенчмарков — доменный сервис `BenchmarkReader` с k-anon-порогом и батч-запросом. Auth по Telegram `initData` (HMAC + `auth_date` freshness) с короткоживущим JWT.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Turborepo, NestJS, Prisma + PostgreSQL, zod, vitest, ioredis (заготовка), Docker Compose.

**Источник правды:** `docs/superpowers/specs/2026-05-29-wedding-planner-telegram-design.md` (§2–§6, §12.2–§12.5, §12.11).

---

## File Structure

```
m-planner/
├── package.json                      # workspace root, scripts, devDeps (turbo, typescript, vitest)
├── pnpm-workspace.yaml               # apps/*, packages/*
├── turbo.json                        # build/test/lint pipelines
├── tsconfig.base.json                # strict TS base
├── vitest.config.ts                  # root vitest (projects)
├── infra/docker-compose.yml          # postgres + redis
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── src/money.ts              # Money (bigint kopecks) + rub()/formatRub()
│   │   ├── src/enums.ts              # City, Tier, WeddingFormat, CategoryUnit, BenchmarkSource
│   │   ├── src/contracts.ts          # zod schemas: EstimateRequest, Aggregate, EstimateResult
│   │   └── src/index.ts
│   └── db/
│       ├── package.json
│       ├── prisma/schema.prisma      # users, wedding_projects, project_members, categories,
│       │                             #   price_benchmarks, budget_items, payments, spend_facts,
│       │                             #   checklist_templates, checklist_items
│       ├── prisma/seed.ts            # categories + seed price_benchmarks (МСК/СПб × tier)
│       └── src/index.ts              # PrismaClient singleton export
└── apps/
    └── api/
        ├── package.json
        ├── src/main.ts
        ├── src/app.module.ts
        ├── src/auth/
        │   ├── init-data.ts          # parseInitData + verifyHmac + checkFreshness
        │   ├── auth.service.ts       # validate initData → upsert user → issue JWT
        │   ├── auth.controller.ts    # POST /auth/telegram
        │   └── jwt.ts                # sign/verify session JWT
        └── src/estimate/
            ├── benchmark-reader.ts   # getAggregates(slice, slugs[]) — k-anon + batch
            ├── estimate.service.ts   # compute estimate from aggregates
            └── estimate.controller.ts# POST /estimate (anonymous)
```

---

## Task 1: Инициализация монорепо

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`

- [ ] **Step 1: Создать git-репозиторий и .gitignore**

Run:
```bash
cd /home/roma/Projects/m-planner
git init
printf 'node_modules\ndist\n.turbo\n.env\n*.log\ncoverage\n' > .gitignore
echo "20" > .nvmrc
```

- [ ] **Step 2: Создать `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Создать корневой `package.json`**

```json
{
  "name": "m-planner",
  "private": true,
  "packageManager": "pnpm@9.7.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 4: Создать `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

- [ ] **Step 5: Создать `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

- [ ] **Step 6: Установить и проверить**

Run:
```bash
pnpm install
pnpm turbo --version
```
Expected: версия turbo печатается, `pnpm-lock.yaml` создан.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

## Task 2: `packages/shared` — тип Money

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/money.ts`, `packages/shared/src/money.test.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Создать `packages/shared/package.json`**

```json
{
  "name": "@m/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "typescript": "^5.5.0", "vitest": "^2.0.0" }
}
```

- [ ] **Step 2: Создать `packages/shared/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
```

- [ ] **Step 3: Написать падающий тест `packages/shared/src/money.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { rub, formatRub, addMoney, type Money } from "./money";

describe("Money (bigint kopecks)", () => {
  it("rub() converts rubles to kopecks as bigint", () => {
    expect(rub(5000)).toBe(500000n as Money);
  });

  it("rub() rounds to whole kopecks (no float drift)", () => {
    expect(rub(0.1 + 0.2)).toBe(30n as Money); // 0.30000000000000004 → 30 kopecks
  });

  it("addMoney() sums kopecks exactly", () => {
    expect(addMoney(rub(5000), rub(2500.5))).toBe(750050n as Money);
  });

  it("formatRub() renders thousands separator and ₽, drops .00", () => {
    expect(formatRub(500000n as Money)).toBe("5 000 ₽");
    expect(formatRub(750050n as Money)).toBe("7 500,50 ₽");
  });
});
```

- [ ] **Step 4: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @m/shared test`
Expected: FAIL — `Cannot find module './money'`.

- [ ] **Step 5: Реализовать `packages/shared/src/money.ts`**

```ts
// Money is a branded bigint count of kopecks (1 ₽ = 100 kopecks).
// One representation across the whole stack; format only at the UI boundary.
declare const moneyBrand: unique symbol;
export type Money = bigint & { readonly [moneyBrand]: true };

/** Convert a rubles number to Money (kopecks), rounding to the nearest kopeck. */
export function rub(rubles: number): Money {
  return BigInt(Math.round(rubles * 100)) as Money;
}

export function addMoney(a: Money, b: Money): Money {
  return (a + b) as Money;
}

/** Multiply Money by an integer count (e.g. per-guest × guests). */
export function mulMoney(a: Money, count: number): Money {
  return (a * BigInt(count)) as Money;
}

/** Format Money as "5 000 ₽" or "7 500,50 ₽" (non-breaking thin space groups). */
export function formatRub(m: Money): string {
  const neg = m < 0n;
  const abs = neg ? -m : m;
  const rubles = abs / 100n;
  const kop = abs % 100n;
  const grouped = rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const tail = kop === 0n ? "" : `,${kop.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${grouped}${tail} ₽`;
}
```

- [ ] **Step 6: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @m/shared test`
Expected: PASS (4 tests).

- [ ] **Step 7: Создать `packages/shared/src/index.ts`**

```ts
export * from "./money";
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): Money type as bigint kopecks with formatRub"
```

---

## Task 3: `packages/shared` — enums и контракты (zod)

**Files:**
- Create: `packages/shared/src/enums.ts`, `packages/shared/src/contracts.ts`, `packages/shared/src/contracts.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Создать `packages/shared/src/enums.ts`**

```ts
export const CITIES = ["msk", "spb"] as const;
export type City = (typeof CITIES)[number];

export const TIERS = ["budget", "mid", "premium"] as const;
export type Tier = (typeof TIERS)[number];

export const FORMATS = ["zags", "vyezdnaya", "kamernaya"] as const;
export type WeddingFormat = (typeof FORMATS)[number];

export const CATEGORY_UNITS = ["per_guest", "fixed"] as const;
export type CategoryUnit = (typeof CATEGORY_UNITS)[number];

export const BENCHMARK_SOURCES = ["seed", "crowd"] as const;
export type BenchmarkSource = (typeof BENCHMARK_SOURCES)[number];
```

- [ ] **Step 2: Написать падающий тест `packages/shared/src/contracts.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { EstimateRequestSchema } from "./contracts";

describe("EstimateRequestSchema", () => {
  it("accepts a valid request", () => {
    const parsed = EstimateRequestSchema.parse({
      city: "msk", format: "zags", tier: "mid", guests: 80,
    });
    expect(parsed.guests).toBe(80);
  });

  it("rejects guests < 1", () => {
    expect(() => EstimateRequestSchema.parse({ city: "msk", format: "zags", tier: "mid", guests: 0 })).toThrow();
  });

  it("rejects unknown city", () => {
    expect(() => EstimateRequestSchema.parse({ city: "kzn", format: "zags", tier: "mid", guests: 50 })).toThrow();
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/shared test`
Expected: FAIL — `Cannot find module './contracts'`.

- [ ] **Step 4: Реализовать `packages/shared/src/contracts.ts`**

```ts
import { z } from "zod";
import { CITIES, TIERS, FORMATS } from "./enums";

export const EstimateRequestSchema = z.object({
  city: z.enum(CITIES),
  format: z.enum(FORMATS),
  tier: z.enum(TIERS),
  guests: z.number().int().min(1).max(2000),
});
export type EstimateRequest = z.infer<typeof EstimateRequestSchema>;

// Money crosses the API boundary as a decimal string of kopecks (bigint-safe in JSON).
export const AggregateSchema = z.object({
  categorySlug: z.string(),
  source: z.enum(["seed", "crowd"]),
  p25: z.string(),       // kopecks as string
  median: z.string(),
  p75: z.string(),
  sampleCount: z.number().int(),
  asOfYear: z.number().int().nullable(),
});
export type AggregateDTO = z.infer<typeof AggregateSchema>;

export const EstimateLineSchema = z.object({
  categorySlug: z.string(),
  label: z.string(),                  // "По 7 реальным свадьбам" | "Ориентир (2026)"
  source: z.enum(["seed", "crowd"]),
  low: z.string(),                    // p25 × guests (or fixed), kopecks string
  mid: z.string(),
  high: z.string(),
});
export type EstimateLine = z.infer<typeof EstimateLineSchema>;

export const EstimateResultSchema = z.object({
  lines: z.array(EstimateLineSchema),
  totalLow: z.string(),
  totalMid: z.string(),
  totalHigh: z.string(),
});
export type EstimateResult = z.infer<typeof EstimateResultSchema>;
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/shared test`
Expected: PASS.

- [ ] **Step 6: Обновить `packages/shared/src/index.ts`**

```ts
export * from "./money";
export * from "./enums";
export * from "./contracts";
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): enums and zod contracts for estimate"
```

---

## Task 4: `packages/db` — Prisma-схема и инфраструктура

**Files:**
- Create: `infra/docker-compose.yml`, `packages/db/package.json`, `packages/db/prisma/schema.prisma`, `packages/db/src/index.ts`, `.env.example`

- [ ] **Step 1: Создать `infra/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mplanner
      POSTGRES_PASSWORD: mplanner
      POSTGRES_DB: mplanner
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  pgdata:
```

- [ ] **Step 2: Создать `.env.example` и `.env`**

```bash
printf 'DATABASE_URL="postgresql://mplanner:mplanner@localhost:5432/mplanner?schema=public"\nREDIS_URL="redis://localhost:6379"\nBOT_TOKEN="000000:TEST_TOKEN"\nJWT_SECRET="dev-secret-change-me"\n' > .env.example
cp .env.example .env
```

- [ ] **Step 3: Создать `packages/db/package.json`**

```json
{
  "name": "@m/db",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "seed": "tsx prisma/seed.ts",
    "typecheck": "tsc --noEmit",
    "build": "prisma generate"
  },
  "dependencies": { "@prisma/client": "^5.18.0" },
  "devDependencies": { "prisma": "^5.18.0", "tsx": "^4.16.0", "typescript": "^5.5.0", "@m/shared": "workspace:*" },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

- [ ] **Step 4: Создать `packages/db/prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id         String   @id @default(cuid())
  telegramId BigInt   @unique @map("telegram_id")
  name       String?
  tz         String   @default("Europe/Moscow")
  createdAt  DateTime @default(now()) @map("created_at")
  ownedProjects WeddingProject[] @relation("owner")
  memberships   ProjectMember[]
  @@map("users")
}

model WeddingProject {
  id                 String   @id @default(cuid())
  ownerId            String   @map("owner_id")
  owner              User     @relation("owner", fields: [ownerId], references: [id])
  city               String
  weddingDate        DateTime @map("wedding_date")
  format             String   // zags|vyezdnaya|kamernaya
  guestCount         Int      @map("guest_count")
  tier               String   // budget|mid|premium
  zagsApplicationDate DateTime? @map("zags_application_date")
  createdAt          DateTime @default(now()) @map("created_at")
  members     ProjectMember[]
  budgetItems BudgetItem[]
  checklistItems ChecklistItem[]
  @@map("wedding_projects")
}

model ProjectMember {
  projectId String @map("project_id")
  userId    String @map("user_id")
  role      String // owner|partner
  project   WeddingProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User           @relation(fields: [userId], references: [id])
  @@id([projectId, userId])
  @@map("project_members")
}

model Category {
  id    String @id @default(cuid())
  slug  String @unique
  name  String
  unit  String // per_guest|fixed
  sort  Int
  benchmarks PriceBenchmark[]
  budgetItems BudgetItem[]
  spendFacts  SpendFact[]
  @@map("categories")
}

model PriceBenchmark {
  categoryId  String  @map("category_id")
  category    Category @relation(fields: [categoryId], references: [id])
  city        String
  tier        String
  source      String  // seed|crowd
  p25         BigInt  // kopecks
  median      BigInt
  p75         BigInt
  sampleCount Int     @map("sample_count")
  asOfYear    Int?    @map("as_of_year")
  updatedAt   DateTime @updatedAt @map("updated_at")
  @@id([categoryId, city, tier, source])
  @@map("price_benchmarks")
}

model BudgetItem {
  id           String  @id @default(cuid())
  projectId    String  @map("project_id")
  project      WeddingProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  categoryId   String  @map("category_id")
  category     Category @relation(fields: [categoryId], references: [id])
  vendorName   String? @map("vendor_name")
  plannedAmount BigInt @map("planned_amount") // kopecks
  status       String  @default("planned")
  version      Int     @default(0)            // optimistic lock (Plan 3)
  payments     Payment[]
  @@map("budget_items")
}

model Payment {
  id           String  @id @default(cuid())
  budgetItemId String  @map("budget_item_id")
  budgetItem   BudgetItem @relation(fields: [budgetItemId], references: [id], onDelete: Cascade)
  type         String  // prepay|balance|full
  amount       BigInt  // kopecks
  dueDate      DateTime? @map("due_date")
  paidAt       DateTime? @map("paid_at")
  payer        String  // couple|parents|other
  version      Int     @default(0)            // optimistic lock (Plan 3)
  @@map("payments")
}

model SpendFact {
  id         String   @id @default(cuid())
  projectId  String   @map("project_id")   // for upsert/delete only — EXCLUDED from aggregates
  categoryId String   @map("category_id")
  category   Category @relation(fields: [categoryId], references: [id])
  city       String
  tier       String
  format     String
  guestCount Int      @map("guest_count")
  amount     BigInt   // kopecks (final summed value per project+category)
  createdAt  DateTime @default(now()) @map("created_at")
  @@unique([projectId, categoryId])         // one fact per project+category (Plan 2)
  @@index([categoryId, city, tier, format])
  @@map("spend_facts")
}

model ChecklistTemplate {
  key         String  @id
  title       String
  kind        String  // zags|vendor|general
  offsetDaysBeforeWedding Int @map("offset_days_before_wedding")
  city        String? // null = all cities; set for zags compliance (Plan 3)
  sourceUrl   String? @map("source_url")
  reviewDate  DateTime? @map("review_date")
  items ChecklistItem[]
  @@map("checklist_templates")
}

model ChecklistItem {
  id          String   @id @default(cuid())
  projectId   String   @map("project_id")
  project     WeddingProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  templateKey String   @map("template_key")
  template    ChecklistTemplate @relation(fields: [templateKey], references: [key])
  title       String
  dueDate     DateTime @map("due_date")
  done        Boolean  @default(false)
  reminderAt  DateTime? @map("reminder_at")
  reminderStatus String? @map("reminder_status") // sent|failed|blocked (Plan 4)
  ackAt       DateTime? @map("ack_at")            // dedup across channels (Plan 4)
  @@map("checklist_items")
}
```

- [ ] **Step 5: Поднять БД и применить миграцию**

Run:
```bash
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @m/db exec prisma migrate dev --name init
```
Expected: контейнеры запущены; миграция `init` создана и применена; `@prisma/client` сгенерирован.

- [ ] **Step 6: Создать `packages/db/src/index.ts`**

```ts
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();
export * from "@prisma/client";
```

- [ ] **Step 7: Commit**

```bash
git add packages/db infra .env.example
git commit -m "feat(db): prisma schema, docker-compose, prisma client"
```

---

## Task 5: Сидинг категорий и seed-бенчмарков

**Files:**
- Create: `packages/db/prisma/seed.ts`, `packages/db/prisma/seed.test.ts`

- [ ] **Step 1: Написать падающий тест `packages/db/prisma/seed.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/index";
import { seed } from "./seed";

describe("seed", () => {
  beforeAll(async () => { await seed(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("creates categories with units", async () => {
    const cats = await prisma.category.findMany();
    expect(cats.length).toBeGreaterThanOrEqual(6);
    expect(cats.find((c) => c.slug === "banquet")?.unit).toBe("per_guest");
  });

  it("creates seed benchmarks for msk×mid with as_of_year set", async () => {
    const b = await prisma.priceBenchmark.findFirst({
      where: { city: "msk", tier: "mid", source: "seed", category: { slug: "banquet" } },
    });
    expect(b).not.toBeNull();
    expect(b!.asOfYear).toBe(2026);
    expect(b!.median).toBeGreaterThan(0n);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/db exec vitest run prisma/seed.test.ts`
Expected: FAIL — `seed` not exported.

- [ ] **Step 3: Реализовать `packages/db/prisma/seed.ts`**

```ts
import { prisma } from "../src/index";
import { rub } from "@m/shared";

// Seed price grid: median ₽ per category × tier (МСК base). СПб ≈ 0.85× МСК.
// Sources: audience-research.docx / market-sizing.md (ориентир 2026).
const CATEGORIES = [
  { slug: "banquet", name: "Банкет", unit: "per_guest", sort: 1, msk: { budget: 3500, mid: 5000, premium: 8000 } },
  { slug: "venue", name: "Площадка", unit: "fixed", sort: 2, msk: { budget: 80000, mid: 200000, premium: 500000 } },
  { slug: "photo", name: "Фотограф", unit: "fixed", sort: 3, msk: { budget: 40000, mid: 80000, premium: 150000 } },
  { slug: "host", name: "Ведущий", unit: "fixed", sort: 4, msk: { budget: 35000, mid: 70000, premium: 130000 } },
  { slug: "decor", name: "Декор", unit: "fixed", sort: 5, msk: { budget: 50000, mid: 150000, premium: 400000 } },
  { slug: "dress", name: "Платье", unit: "fixed", sort: 6, msk: { budget: 30000, mid: 80000, premium: 200000 } },
  { slug: "music", name: "Музыка/DJ", unit: "fixed", sort: 7, msk: { budget: 30000, mid: 60000, premium: 120000 } },
] as const;

const SPB_FACTOR = 0.85;
const TIERS = ["budget", "mid", "premium"] as const;
const CITIES: Record<"msk" | "spb", number> = { msk: 1, spb: SPB_FACTOR };

export async function seed() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, unit: c.unit, sort: c.sort },
      create: { slug: c.slug, name: c.name, unit: c.unit, sort: c.sort },
    });
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: c.slug } });
    for (const [city, factor] of Object.entries(CITIES) as ["msk" | "spb", number][]) {
      for (const tier of TIERS) {
        const med = c.msk[tier] * factor;
        await prisma.priceBenchmark.upsert({
          where: { categoryId_city_tier_source: { categoryId: cat.id, city, tier, source: "seed" } },
          update: { p25: rub(med * 0.8), median: rub(med), p75: rub(med * 1.3), sampleCount: 0, asOfYear: 2026 },
          create: {
            categoryId: cat.id, city, tier, source: "seed",
            p25: rub(med * 0.8), median: rub(med), p75: rub(med * 1.3), sampleCount: 0, asOfYear: 2026,
          },
        });
      }
    }
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().then(() => prisma.$disconnect()).then(() => console.log("seeded"));
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @m/db exec vitest run prisma/seed.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma
git commit -m "feat(db): seed categories and 2026 seed price benchmarks"
```

---

## Task 6: `apps/api` — каркас NestJS

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health.controller.ts`, `apps/api/test/health.e2e.test.ts`

- [ ] **Step 1: Создать `apps/api/package.json`**

```json
{
  "name": "@m/api",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "start": "node dist/main.js",
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0", "@nestjs/core": "^10.3.0", "@nestjs/platform-express": "^10.3.0",
    "reflect-metadata": "^0.2.0", "rxjs": "^7.8.0",
    "@m/shared": "workspace:*", "@m/db": "workspace:*",
    "jsonwebtoken": "^9.0.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.3.0", "typescript": "^5.5.0", "tsx": "^4.16.0",
    "vitest": "^2.0.0", "supertest": "^7.0.0", "@types/jsonwebtoken": "^9.0.0", "@types/supertest": "^6.0.0"
  }
}
```

- [ ] **Step 2: Создать `apps/api/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src", "module": "CommonJS", "moduleResolution": "Node" }, "include": ["src"] }
```

- [ ] **Step 3: Написать падающий e2e-тест `apps/api/test/health.e2e.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";

let app: INestApplication;
beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterAll(async () => { await app.close(); });

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 4: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api test`
Expected: FAIL — `AppModule` not found.

- [ ] **Step 5: Реализовать каркас**

`apps/api/src/health.controller.ts`:
```ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() { return { status: "ok" }; }
}
```

`apps/api/src/app.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({ controllers: [HealthController] })
export class AppModule {}
```

`apps/api/src/main.ts`:
```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/api test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): NestJS scaffold with health endpoint"
```

---

## Task 7: Auth — парсинг и валидация `initData` (T3)

**Files:**
- Create: `apps/api/src/auth/init-data.ts`, `apps/api/src/auth/init-data.test.ts`

**Спек:** §12.3 — HMAC-подпись + проверка `auth_date` freshness.

- [ ] **Step 1: Написать падающий тест `apps/api/src/auth/init-data.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseAndVerifyInitData, InitDataError } from "./init-data";

const BOT_TOKEN = "123456:TEST";

// Build a valid initData string the same way Telegram does.
function buildInitData(authDateSec: number, user = { id: 42, first_name: "Roma" }) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDateSec));
  params.set("user", JSON.stringify(user));
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("parseAndVerifyInitData", () => {
  const now = 1_900_000_000; // fixed "now" in seconds

  it("accepts a fresh, correctly signed initData", () => {
    const initData = buildInitData(now - 10);
    const result = parseAndVerifyInitData(initData, BOT_TOKEN, { nowSec: now, maxAgeSec: 86400 });
    expect(result.user.id).toBe(42);
  });

  it("rejects a tampered hash", () => {
    const bad = buildInitData(now - 10).replace(/hash=[0-9a-f]+/, "hash=deadbeef");
    expect(() => parseAndVerifyInitData(bad, BOT_TOKEN, { nowSec: now, maxAgeSec: 86400 }))
      .toThrow(InitDataError);
  });

  it("rejects stale initData (replay) older than maxAge", () => {
    const stale = buildInitData(now - 90000); // > 24h
    expect(() => parseAndVerifyInitData(stale, BOT_TOKEN, { nowSec: now, maxAgeSec: 86400 }))
      .toThrow(/stale/);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api exec vitest run src/auth/init-data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Реализовать `apps/api/src/auth/init-data.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export class InitDataError extends Error {}

export interface TelegramUser { id: number; first_name?: string; username?: string; }
export interface VerifiedInitData { user: TelegramUser; authDateSec: number; }

interface Opts { nowSec: number; maxAgeSec: number; }

/**
 * Validate Telegram Mini App initData:
 *  1. recompute HMAC over the sorted data-check-string and compare (timing-safe)
 *  2. reject if auth_date is older than maxAgeSec (anti-replay, §12.3)
 */
export function parseAndVerifyInitData(initData: string, botToken: string, opts: Opts): VerifiedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new InitDataError("missing hash");
  params.delete("hash");

  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest("hex");

  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InitDataError("bad signature");

  const authDateSec = Number(params.get("auth_date"));
  if (!authDateSec) throw new InitDataError("missing auth_date");
  if (opts.nowSec - authDateSec > opts.maxAgeSec) throw new InitDataError("stale initData (replay)");

  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("missing user");
  const user = JSON.parse(userRaw) as TelegramUser;
  return { user, authDateSec };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/api exec vitest run src/auth/init-data.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): verify Telegram initData HMAC + auth_date freshness"
```

---

## Task 8: Auth — session JWT (T3)

**Files:**
- Create: `apps/api/src/auth/jwt.ts`, `apps/api/src/auth/jwt.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/auth/jwt.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession, SessionExpiredError } from "./jwt";

const SECRET = "test-secret";

describe("session jwt", () => {
  it("signs and verifies a session", () => {
    const token = signSession({ userId: "u1" }, SECRET, { ttlSec: 3600, nowSec: 1000 });
    const claims = verifySession(token, SECRET, { nowSec: 1000 });
    expect(claims.userId).toBe("u1");
  });

  it("throws SessionExpiredError after ttl", () => {
    const token = signSession({ userId: "u1" }, SECRET, { ttlSec: 3600, nowSec: 1000 });
    expect(() => verifySession(token, SECRET, { nowSec: 1000 + 3601 })).toThrow(SessionExpiredError);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api exec vitest run src/auth/jwt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `apps/api/src/auth/jwt.ts`**

```ts
import jwt from "jsonwebtoken";

export class SessionExpiredError extends Error {}
export interface SessionClaims { userId: string; }

export function signSession(claims: SessionClaims, secret: string, opts: { ttlSec: number; nowSec?: number }): string {
  const iat = opts.nowSec ?? Math.floor(Date.now() / 1000);
  return jwt.sign({ userId: claims.userId, iat, exp: iat + opts.ttlSec }, secret, { algorithm: "HS256" });
}

export function verifySession(token: string, secret: string, opts?: { nowSec?: number }): SessionClaims {
  try {
    const now = opts?.nowSec;
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      clockTimestamp: now, // deterministic in tests
    }) as { userId: string };
    return { userId: decoded.userId };
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new SessionExpiredError("session expired");
    throw e;
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/api exec vitest run src/auth/jwt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): short-lived session JWT sign/verify"
```

---

## Task 9: Auth — сервис и контроллер `POST /auth/telegram`

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/auth.service.test.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/auth/auth.service.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { AuthService } from "./auth.service";
import { InitDataError } from "./init-data";

const fakePrisma = {
  user: { upsert: vi.fn().mockResolvedValue({ id: "u1", telegramId: 42n }) },
} as any;

describe("AuthService.login", () => {
  const config = { botToken: "123456:TEST", jwtSecret: "s", nowSec: 1_900_000_000, jwtTtlSec: 3600, initDataMaxAgeSec: 86400 };

  it("returns a session token for valid initData", async () => {
    const svc = new AuthService(fakePrisma, config);
    // reuse the helper logic inline: build valid initData
    const { createHmac } = await import("node:crypto");
    const params = new URLSearchParams();
    params.set("auth_date", String(config.nowSec - 5));
    params.set("user", JSON.stringify({ id: 42, first_name: "Roma" }));
    const dc = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(config.botToken).digest();
    params.set("hash", createHmac("sha256", secret).update(dc).digest("hex"));

    const res = await svc.login(params.toString());
    expect(res.token).toBeTypeOf("string");
    expect(fakePrisma.user.upsert).toHaveBeenCalled();
  });

  it("rejects invalid initData", async () => {
    const svc = new AuthService(fakePrisma, config);
    await expect(svc.login("auth_date=1&user=%7B%7D&hash=bad")).rejects.toBeInstanceOf(InitDataError);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api exec vitest run src/auth/auth.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать сервис `apps/api/src/auth/auth.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { parseAndVerifyInitData } from "./init-data";
import { signSession } from "./jwt";

export interface AuthConfig {
  botToken: string; jwtSecret: string; jwtTtlSec: number; initDataMaxAgeSec: number; nowSec?: number;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("AUTH_CONFIG") private readonly config: AuthConfig,
  ) {}

  async login(initData: string): Promise<{ token: string; userId: string }> {
    const nowSec = this.config.nowSec ?? Math.floor(Date.now() / 1000);
    const verified = parseAndVerifyInitData(initData, this.config.botToken, {
      nowSec, maxAgeSec: this.config.initDataMaxAgeSec,
    });
    const user = await this.prisma.user.upsert({
      where: { telegramId: BigInt(verified.user.id) },
      update: { name: verified.user.first_name ?? null },
      create: { telegramId: BigInt(verified.user.id), name: verified.user.first_name ?? null },
    });
    const token = signSession({ userId: user.id }, this.config.jwtSecret, { ttlSec: this.config.jwtTtlSec, nowSec });
    return { token, userId: user.id };
  }
}
```

- [ ] **Step 4: Реализовать контроллер `apps/api/src/auth/auth.controller.ts`**

```ts
import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { InitDataError } from "./init-data";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("telegram")
  async telegram(@Body() body: { initData?: string }) {
    if (!body?.initData) throw new UnauthorizedException("missing initData");
    try {
      return await this.auth.login(body.initData);
    } catch (e) {
      if (e instanceof InitDataError) throw new UnauthorizedException(e.message);
      throw e;
    }
  }
}
```

- [ ] **Step 5: Реализовать модуль `apps/api/src/auth/auth.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: "PRISMA", useValue: prisma },
    {
      provide: "AUTH_CONFIG",
      useValue: {
        botToken: process.env.BOT_TOKEN ?? "",
        jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
        jwtTtlSec: 3600,
        initDataMaxAgeSec: 86400,
      },
    },
  ],
  exports: [AuthService, "PRISMA"],
})
export class AuthModule {}
```

- [ ] **Step 6: Подключить в `apps/api/src/app.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";

@Module({ imports: [AuthModule], controllers: [HealthController] })
export class AppModule {}
```

- [ ] **Step 7: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/api exec vitest run src/auth/auth.service.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): POST /auth/telegram login flow"
```

---

## Task 10: `BenchmarkReader` — k-anon + батч (T2, §12.2/§12.11/§12.4)

**Files:**
- Create: `apps/api/src/estimate/benchmark-reader.ts`, `apps/api/src/estimate/benchmark-reader.test.ts`

**Ключевое:** единственная точка чтения агрегатов; ниже порога — seed/«недостаточно данных», никогда raw малая выборка; батч-запрос за все категории.

- [ ] **Step 1: Написать падающий тест `apps/api/src/estimate/benchmark-reader.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { BenchmarkReader, type Slice } from "./benchmark-reader";

// In-memory fake of the prisma.priceBenchmark.findMany call.
function fakePrisma(rows: any[]) {
  return { priceBenchmark: { findMany: vi.fn().mockResolvedValue(rows) } } as any;
}
const slice: Slice = { city: "msk", tier: "mid", format: "zags" };

describe("BenchmarkReader.getAggregates", () => {
  it("returns crowd when sampleCount >= threshold", async () => {
    const reader = new BenchmarkReader(
      fakePrisma([
        { categoryId: "c1", source: "crowd", p25: 10n, median: 20n, p75: 30n, sampleCount: 7, asOfYear: null, category: { slug: "banquet" } },
        { categoryId: "c1", source: "seed", p25: 5n, median: 15n, p75: 25n, sampleCount: 0, asOfYear: 2026, category: { slug: "banquet" } },
      ]),
      { threshold: 5 },
    );
    const res = await reader.getAggregates(slice, ["banquet"]);
    expect(res.get("banquet")?.source).toBe("crowd");
    expect(res.get("banquet")?.median).toBe(20n);
  });

  it("falls back to seed when crowd sampleCount < threshold", async () => {
    const reader = new BenchmarkReader(
      fakePrisma([
        { categoryId: "c1", source: "crowd", p25: 10n, median: 20n, p75: 30n, sampleCount: 2, asOfYear: null, category: { slug: "banquet" } },
        { categoryId: "c1", source: "seed", p25: 5n, median: 15n, p75: 25n, sampleCount: 0, asOfYear: 2026, category: { slug: "banquet" } },
      ]),
      { threshold: 5 },
    );
    const res = await reader.getAggregates(slice, ["banquet"]);
    expect(res.get("banquet")?.source).toBe("seed");
    expect(res.get("banquet")?.median).toBe(15n);
  });

  it("returns insufficient when neither crowd>=threshold nor seed exists", async () => {
    const reader = new BenchmarkReader(fakePrisma([]), { threshold: 5 });
    const res = await reader.getAggregates(slice, ["banquet"]);
    expect(res.get("banquet")).toEqual({ insufficient: true });
  });

  it("issues ONE query for all categories (no N+1)", async () => {
    const prisma = fakePrisma([]);
    const reader = new BenchmarkReader(prisma, { threshold: 5 });
    await reader.getAggregates(slice, ["banquet", "venue", "photo"]);
    expect(prisma.priceBenchmark.findMany).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api exec vitest run src/estimate/benchmark-reader.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `apps/api/src/estimate/benchmark-reader.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { City, Tier, WeddingFormat, Money } from "@m/shared";

export interface Slice { city: City; tier: Tier; format: WeddingFormat; }

export interface Aggregate {
  categorySlug: string;
  source: "seed" | "crowd";
  p25: Money; median: Money; p75: Money;
  sampleCount: number;
  asOfYear: number | null;
}
export type AggregateResult = Aggregate | { insufficient: true };

/**
 * The ONLY door to price aggregates. Enforces the k-anon threshold for every read
 * (estimate, /showcase, OG landing). Raw price_benchmarks never leaves this class.
 * Batched: one findMany for all categories in a slice (no N+1).
 */
@Injectable()
export class BenchmarkReader {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("BENCHMARK_CONFIG") private readonly config: { threshold: number },
  ) {}

  async getAggregates(slice: Slice, categorySlugs: string[]): Promise<Map<string, AggregateResult>> {
    const rows = await this.prisma.priceBenchmark.findMany({
      where: { city: slice.city, tier: slice.tier, category: { slug: { in: categorySlugs } } },
      include: { category: { select: { slug: true } } },
    });

    const bySlug = new Map<string, { crowd?: typeof rows[number]; seed?: typeof rows[number] }>();
    for (const r of rows) {
      const slug = (r as any).category.slug as string;
      const e = bySlug.get(slug) ?? {};
      if (r.source === "crowd") e.crowd = r; else if (r.source === "seed") e.seed = r;
      bySlug.set(slug, e);
    }

    const out = new Map<string, AggregateResult>();
    for (const slug of categorySlugs) {
      const e = bySlug.get(slug);
      const crowd = e?.crowd;
      if (crowd && crowd.sampleCount >= this.config.threshold) {
        out.set(slug, this.toAggregate(slug, crowd));
      } else if (e?.seed) {
        out.set(slug, this.toAggregate(slug, e.seed));
      } else {
        out.set(slug, { insufficient: true });
      }
    }
    return out;
  }

  private toAggregate(slug: string, r: { source: string; p25: bigint; median: bigint; p75: bigint; sampleCount: number; asOfYear: number | null }): Aggregate {
    return {
      categorySlug: slug,
      source: r.source as "seed" | "crowd",
      p25: r.p25 as Money, median: r.median as Money, p75: r.p75 as Money,
      sampleCount: r.sampleCount, asOfYear: r.asOfYear,
    };
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/api exec vitest run src/estimate/benchmark-reader.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/estimate
git commit -m "feat(api): BenchmarkReader with k-anon threshold and batched query"
```

---

## Task 11: `EstimateService` — расчёт сметы + маркировка (T2, §5.1, §12.4)

**Files:**
- Create: `apps/api/src/estimate/estimate.service.ts`, `apps/api/src/estimate/estimate.service.test.ts`

- [ ] **Step 1: Написать падающий тест `apps/api/src/estimate/estimate.service.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { EstimateService } from "./estimate.service";
import type { AggregateResult } from "./benchmark-reader";

// Fake reader returning fixed aggregates; categories carry their unit.
function makeService(aggs: Record<string, AggregateResult>, units: Record<string, "per_guest" | "fixed">) {
  const reader = {
    getAggregates: async (_s: any, slugs: string[]) => new Map(slugs.map((s) => [s, aggs[s]])),
  } as any;
  const prisma = {
    category: { findMany: async () => Object.entries(units).map(([slug, unit], i) => ({ slug, unit, name: slug, sort: i })) },
  } as any;
  return new EstimateService(reader, prisma);
}

describe("EstimateService.compute", () => {
  it("multiplies per_guest median by guests and keeps fixed as-is", async () => {
    const svc = makeService(
      {
        banquet: { categorySlug: "banquet", source: "crowd", p25: 400000n, median: 500000n, p75: 800000n, sampleCount: 7, asOfYear: null } as any,
        photo:   { categorySlug: "photo",   source: "seed",  p25: 6400000n, median: 8000000n, p75: 10400000n, sampleCount: 0, asOfYear: 2026 } as any,
      },
      { banquet: "per_guest", photo: "fixed" },
    );
    const res = await svc.compute({ city: "msk", format: "zags", tier: "mid", guests: 80 });
    const banquet = res.lines.find((l) => l.categorySlug === "banquet")!;
    expect(banquet.mid).toBe(String(500000n * 80n)); // 80 guests
    expect(banquet.label).toBe("По 7 реальным свадьбам");
    const photo = res.lines.find((l) => l.categorySlug === "photo")!;
    expect(photo.mid).toBe("8000000");
    expect(photo.label).toBe("Ориентир (2026)"); // §12.4 — seed never labeled "реальные"
  });

  it("skips categories with insufficient data", async () => {
    const svc = makeService(
      { banquet: { insufficient: true } },
      { banquet: "per_guest" },
    );
    const res = await svc.compute({ city: "msk", format: "zags", tier: "mid", guests: 50 });
    expect(res.lines).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api exec vitest run src/estimate/estimate.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `apps/api/src/estimate/estimate.service.ts`**

```ts
import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { EstimateRequest, EstimateResult, EstimateLine, Money } from "@m/shared";
import { mulMoney } from "@m/shared";
import { BenchmarkReader, type Aggregate } from "./benchmark-reader";

@Injectable()
export class EstimateService {
  constructor(
    private readonly reader: BenchmarkReader,
    @Inject("PRISMA") private readonly prisma: PrismaClient,
  ) {}

  async compute(req: EstimateRequest): Promise<EstimateResult> {
    const categories = await this.prisma.category.findMany({ orderBy: { sort: "asc" } });
    const slugs = categories.map((c) => c.slug);
    const unitBySlug = new Map(categories.map((c) => [c.slug, c.unit as "per_guest" | "fixed"]));

    const aggs = await this.reader.getAggregates(
      { city: req.city, tier: req.tier, format: req.format }, slugs,
    );

    const lines: EstimateLine[] = [];
    let totalLow = 0n, totalMid = 0n, totalHigh = 0n;

    for (const slug of slugs) {
      const a = aggs.get(slug);
      if (!a || "insufficient" in a) continue;
      const unit = unitBySlug.get(slug)!;
      const scale = (m: Money): Money => (unit === "per_guest" ? mulMoney(m, req.guests) : m);
      const low = scale(a.p25), mid = scale(a.median), high = scale(a.p75);
      totalLow += low; totalMid += mid; totalHigh += high;
      lines.push({
        categorySlug: slug,
        source: a.source,
        label: this.label(a),
        low: low.toString(), mid: mid.toString(), high: high.toString(),
      });
    }

    return {
      lines,
      totalLow: totalLow.toString(), totalMid: totalMid.toString(), totalHigh: totalHigh.toString(),
    };
  }

  // §12.4: "реальные" only for crowd; seed → "Ориентир (YYYY)".
  private label(a: Aggregate): string {
    return a.source === "crowd"
      ? `По ${a.sampleCount} реальным свадьбам`
      : `Ориентир (${a.asOfYear ?? "—"})`;
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/api exec vitest run src/estimate/estimate.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/estimate
git commit -m "feat(api): EstimateService computes estimate with honest seed/crowd labels"
```

---

## Task 12: `POST /estimate` (анонимный) + модуль Estimate

**Files:**
- Create: `apps/api/src/estimate/estimate.controller.ts`, `apps/api/src/estimate/estimate.module.ts`, `apps/api/test/estimate.e2e.test.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Написать падающий e2e-тест `apps/api/test/estimate.e2e.test.ts`**

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

describe("POST /estimate (anonymous)", () => {
  it("returns lines and totals for a valid request", async () => {
    const res = await request(app.getHttpServer())
      .post("/estimate")
      .send({ city: "msk", format: "zags", tier: "mid", guests: 80 });
    expect(res.status).toBe(201);
    expect(res.body.lines.length).toBeGreaterThan(0);
    expect(BigInt(res.body.totalMid)).toBeGreaterThan(0n);
    // banquet is per_guest → scaled by 80
    const banquet = res.body.lines.find((l: any) => l.categorySlug === "banquet");
    expect(banquet.label).toMatch(/Ориентир/); // seed at launch
  });

  it("rejects invalid guests with 400", async () => {
    const res = await request(app.getHttpServer())
      .post("/estimate")
      .send({ city: "msk", format: "zags", tier: "mid", guests: 0 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @m/api exec vitest run test/estimate.e2e.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать контроллер `apps/api/src/estimate/estimate.controller.ts`**

```ts
import { Body, Controller, Post, BadRequestException } from "@nestjs/common";
import { EstimateRequestSchema } from "@m/shared";
import { EstimateService } from "./estimate.service";

@Controller("estimate")
export class EstimateController {
  constructor(private readonly estimate: EstimateService) {}

  @Post()
  async compute(@Body() body: unknown) {
    const parsed = EstimateRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.estimate.compute(parsed.data);
  }
}
```

- [ ] **Step 4: Реализовать модуль `apps/api/src/estimate/estimate.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { BenchmarkReader } from "./benchmark-reader";
import { EstimateService } from "./estimate.service";
import { EstimateController } from "./estimate.controller";

@Module({
  controllers: [EstimateController],
  providers: [
    BenchmarkReader,
    EstimateService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "BENCHMARK_CONFIG", useValue: { threshold: Number(process.env.N_THRESHOLD ?? 5) } },
  ],
  exports: [BenchmarkReader, EstimateService],
})
export class EstimateModule {}
```

- [ ] **Step 5: Подключить в `apps/api/src/app.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { EstimateModule } from "./estimate/estimate.module";

@Module({ imports: [AuthModule, EstimateModule], controllers: [HealthController] })
export class AppModule {}
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `pnpm --filter @m/api exec vitest run test/estimate.e2e.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): POST /estimate anonymous endpoint"
```

---

## Task 13: Сквозная проверка Плана 1

- [ ] **Step 1: Полный прогон тестов и типов**

Run:
```bash
pnpm turbo run typecheck test
```
Expected: все пакеты зелёные.

- [ ] **Step 2: Ручная smoke-проверка сметы**

Run:
```bash
pnpm --filter @m/db exec tsx prisma/seed.ts
pnpm --filter @m/api dev &
sleep 3
curl -s -XPOST localhost:3001/estimate -H 'content-type: application/json' \
  -d '{"city":"msk","format":"zags","tier":"mid","guests":80}' | head -c 400
```
Expected: JSON с `lines` (banquet помечен «Ориентир (2026)») и положительным `totalMid`.

- [ ] **Step 3: Commit финального состояния (если есть незакоммиченное)**

```bash
git add -A && git commit -m "chore: plan 1 done — anonymous estimate works end-to-end" || echo "nothing to commit"
```

---

## Self-Review (закрыто)

- **Spec coverage:** §2 (монорепо, auth), §3 (контексты Identity/Estimate заложены), §4 (модель данных целиком, включая поля для Планов 2–4), §5.1 (расчёт сметы), §6 (seed; crowd-агрегация — План 2), §9 (сидинг), §12.2/12.3/12.4/12.5/12.11 — покрыты.
- **Out of plan (по дизайну, дальше):** share/витрина/spend_facts-upsert (План 2), Budget/делегирование/чеклист (План 3), напоминания/152-ФЗ (План 4).
- **Type consistency:** `Money`=bigint kopecks; `Slice`/`Aggregate` единые в `benchmark-reader.ts`; контракты — из `@m/shared`. Поля `version`/`reminderStatus`/`ackAt`/`sourceUrl` уже в схеме, чтобы Планы 2–4 не делали лишних миграций.

## Параметры для реализации
- `N_THRESHOLD` (env, дефолт 5), `initDataMaxAgeSec` (86400), `jwtTtlSec` (3600) — §10, §12.
