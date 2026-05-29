# CLAUDE.md — m-planner

Telegram-нативный планировщик свадьбы под РФ. **Источник правды: `STATUS.md`.**
Спека: `docs/superpowers/specs/2026-05-29-wedding-planner-telegram-design.md` (§11 CEO, §12 Eng).
Планы: `docs/superpowers/plans/2026-05-29-plan-{1..4}-*.md`. Отложенное: `docs/TODOS.md`.

## Язык
Общение — русский. Код/комментарии — английский. Коммиты — conventional, английский, без Co-Authored-By.

## Архитектура
Монорепо pnpm + Turborepo (TypeScript strict). `apps/{miniapp(Next.js)|api(NestJS)|bot(grammY,Plan4)}`,
`packages/{shared(Money/enums/zod) | db(Prisma+Postgres)}`. Redis+BullMQ. Деньги — **bigint копейки** везде,
тип `Money` из `@m/shared`, формат только на границе UI. Единый `BenchmarkReader` — единственная точка чтения
агрегатов с k-anon-порогом (floor 1).

## Команды
```bash
# окружение (БД/Redis на НЕстандартных портах 5440/6390, см. .env)
docker compose --env-file .env -f infra/docker-compose.yml up -d
# тесты/типы (vitest и prisma сами грузят .env)
pnpm turbo run typecheck test
pnpm --filter @m/api test
# prisma CLI требует env в окружении (ищет .env в cwd/schema, не в корне):
set -a; . ./.env; set +a; pnpm --filter @m/db exec prisma migrate dev --name <x>
# dev API (нужен env + порт):
set -a; . ./.env; set +a; PORT=3001 pnpm --filter @m/api dev
# фронт:
pnpm --filter @m/miniapp dev    # :3000
```

## Gotchas (проверено на практике, не наступай повторно)
- **NestJS DI по типу + esbuild:** `tsx`/esbuild НЕ эмитят decorator-metadata → инъекция по типу пустая в рантайме,
  а vitest-тесты при этом зелёные (там SWC). Тесты — `unplugin-swc`; dev — `@swc-node/register` (`.swcrc` decoratorMetadata).
  **Всегда smoke-тестить живой сервер, не доверять только тестам.**
- **vitest не грузит .env** сам — в `@m/db` и `@m/api` есть `vitest.setup.ts`, который грузит корневой `.env`.
- **Реальные Redis/BullMQ-клиенты** в модулях обязаны закрываться в `OnModuleDestroy` (`.quit()`/`.close()`),
  иначе vitest-сьют виснет на открытых хэндлах. AggregationModule НЕ импортируется в AppModule (Plan 2).
- **Next + workspace-пакеты:** `transpilePackages: ["@m/shared"]` в `next.config.mjs`, иначе build падает на сыром `.ts`.
- **`noUncheckedIndexedAccess: true`** — деструктуризация массивов даёт `T | undefined`; ставь дефолты.
- **Контроллеры:** валидация через `schema.safeParse` + `BadRequestException` (НЕ `.parse()` — тот даёт 500).
- **Follow-up (TODOS [Build]):** prod `build`/`start` у @m/api сломан (ESM-source-workspace) — решить перед деплоем.

## Процесс реализации
Планы исполняются **subagent-driven** (см. `superpowers:subagent-driven-development`): свежий субагент-implementer
на блок задач → spec-compliance review → code-quality review → фиксы. Задачи группируются в когезивные блоки на
естественных швах. Каждый блок оставляет тесты зелёными и сьют выходящим чисто.

## Правила
- НЕ привязывать решения к проекту Cortex (отдельный standalone-проект).
- Файлы < 500 строк; DDD bounded contexts; TDD (тест → падает → реализация → проходит → коммит).
- 152-ФЗ: БД с перс.данными граждан РФ — на серверах в РФ.
