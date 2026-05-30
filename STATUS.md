# STATUS — m-planner

> Источник правды по проекту. Обновляется в конце каждой сессии.
> **Последнее обновление:** 2026-05-29

---

## 1. Что это

**m-planner** — Telegram-нативный планировщик свадьбы под РФ (в первую очередь Москва).
Greenfield-продукт. Пользователь (Roma) — сам жених, строит частично под свою свадьбу.

**Позиционирование:** закрывать не красоту, а главную боль — **«не потерять деньги, нервы и дату»**.

**Линза v1:** продукт живёт ради **виральности + сбора данных** (моат — реальные траты пар),
монетизация честно отложена в Фазу 2. Свадьба разовая → LTV короткий → ставка на acquisition + referral + supply-выручку, а не на retention/подписку пары.

---

## 2. Исследование (основание дизайна)

Документы в репо: `competitor-analysis.docx`, `audience-research.docx`, `market-sizing.md`.

**Топ-боли ЦА:**
1. Доверие к подрядчикам (кидают/молчат) — **9/10**
2. Непрозрачность цен (смету нельзя спрогнозировать) — **9/10**
3. ЗАГС/Госуслуги (сроки, документы) — 8/10
4. Всё валится на невесту — 8/10
5. (камерный/нестандартный формат недообслужен)

**Рынок:** ~880k браков/год (тренд ВНИЗ), в деньгах РАСТЁТ (+20%/год, средний чек >2 млн ₽).
Конкуренты собирают ~100–140k визитов/мес → ниша не перегрета. **Дистрибуция — Telegram, не SEO.**
SOM ~2–12k активных пар/год на горизонте 12–24 мес.
planning.wedding задаёт планку по широте, но не локализован под РФ (нет ЗАГС, ₽-смет, российских подрядчиков, Telegram).

---

## 3. Стратегия и фазы

| Фаза | Что | Боли | Монетизация |
|------|-----|------|-------------|
| **0** | Смета-крючок: формат+город+гостей → реальная ₽-смета за 2 мин | №2 | нет |
| **1** | Планировщик: смета → трекер бюджета+платежи → делегирование → ЗАГС/таймлайн-чеклист | №2,3,4 | нет |
| **2** | Доверие: верификация подрядчиков, рейтинг, чёрный список, безопасная сделка 3–7%, бизнес-портал | №1 | **да** |

**Граница v1 (этот спек):** Фаза 0 + ядро Фазы 1. Объём v1 принят **полным одним куском**.
**Moat:** краудсорс-датасет реальных трат, собираемый трекером бюджета — такого нет ни у кого в РФ.

---

## 4. Стек (подтверждён + уточнён Eng-ревью)

- Монорепо: **pnpm workspaces + Turborepo**, TypeScript (strict), единый язык на всех приложениях.
- `apps/miniapp` — **Next.js** (Telegram Mini App UX + публичные SSR-роуты `/showcase`, `/s/<preset>`).
- `apps/api` — **NestJS** (домен, бизнес-логика).
- `apps/bot` — **grammY** (напоминания, шаринг, deep-links).
- `packages/shared` — TS-типы, **zod**-контракты, доменные value-objects (тип `Money`).
- `packages/db` — **Prisma** + PostgreSQL.
- Очередь/напоминания: **Redis + BullMQ** (delayed jobs).
- Тесты: **vitest** (unit + integration), TDD London.
- Хостинг: Docker на собственном сервере (БД с перс.данными — в РФ, 152-ФЗ).

**Ключевые технические решения:**
- Деньги — **целые копейки (`bigint`)** по всему стеку, тип `Money`, форматирование только на границе UI. Нет float/numeric.
- Единый **`BenchmarkReader`** — единственная точка чтения агрегатов, в ней enforced k-anon-порог `N_threshold` (дефолт 5); сырой `price_benchmarks` наружу не выходит; батч-запрос (нет N+1).
- Auth: HMAC `initData` **+ проверка `auth_date` freshness** (анти-replay) + короткий session-JWT (1ч) с refresh по свежему initData.
- `spend_facts`: один факт на `(project_id, category_id)` (UNIQUE, upsert по итоговой сумме); `project_id` хранится для upsert/удаления, исключён из агрегатов → исполнимо право на удаление по 152-ФЗ + нет дублей.
- Optimistic lock (`version`) на `budget_items`/`payments` → 409 при одновременной правке; прочие поля LWW.
- Маркировка: «По N реальным свадьбам» только для crowd; seed → «Ориентир (2026)». Слово «реальные» никогда не на seed.
- Напоминания: ретраи/экспон.backoff, обработка Telegram 429 и «бот заблокирован», статус `sent|failed|blocked`; видимый fallback в Mini App = view той же сущности reminder + `ack` (дедуп каналов).
- ЗАГС-шаблоны = compliance-контент (`source_url`, `review_date`, привязка к городу), верификация МСК+СПб до запуска.
- Rate-limit анонимных эндпоинтов (Redis) + кэш OG/витрины.

---

## 5. Ревью (gstack)

**CEO-ревью (пройдено):** объём v1 = полный. Приняты 3 расширения (вирусная петля шеринга,
публичная витрина «реальные сметы», камерный режим) + 4 упрочнения (152-ФЗ, надёжность напоминаний,
k-анонимность, безопасность инвайт-токена). Детали — спек §11.

**Eng-ревью (пройдено, CLEARED):** 7 issue решены, 0 крит. gap. Детали — спек §12.
Outside voice (Claude-субагент; Codex был недоступен — лимит): 10 находок, 9 интегрированы, 1 в TODOS.
Критичные тихие сбои закрыты: утечка k-anon, replay initData, упавшее напоминание ЗАГС, отравление моата дублями.

---

## 6. Артефакты

- **Спек (источник правды по дизайну):** `docs/superpowers/specs/2026-05-29-wedding-planner-telegram-design.md`
  (§0–10 дизайн, §11 CEO-ревизия, §12 Eng-ревизия, GSTACK REVIEW REPORT).
- **Планы реализации:** `docs/superpowers/plans/`
  1. `2026-05-29-plan-1-foundation-estimate.md` — фундамент + анонимная смета (Фаза 0).
  2. `2026-05-29-plan-2-acquisition-spine.md` — share-петля, витрина, spend_facts, crowd-агрегация, rate-limit/кэш, метрики.
  3. `2026-05-29-plan-3-planner-depth.md` — бюджет/optimistic-lock, делегирование (инвайт-токен), чеклист, камерный режим.
  4. `2026-05-29-plan-4-reminders-compliance.md` — напоминания (BullMQ+бот, retries/429/blocked, fallback), 152-ФЗ consent+delete, seed-refresh, 3 крит. integration-теста.
- **TODOS:** `docs/TODOS.md` — cold-start моата (цель spend_facts + укрупнённые срезы); чёрный список lite (Фаза 2).
- **gstack-артефакты:** `~/.gstack/projects/m-planner/` (test-plan, tasks-eng-review JSONL, reviews log).

Планы — полные bite-sized TDD (падающий тест → запуск → реализация → запуск → коммит) с реальным кодом, точными путями и командами. 14 задач Eng-ревью распределены по планам.

---

## 7. Текущий статус

- ✅ Брейншторм → спек → CEO-ревью → Eng-ревью → 4 плана реализации.
- ✅ **План 1 реализован и смёржен в main** (subagent-driven, 18 коммитов, merge `46acaf3`, 2026-05-29). Монорепо (pnpm+Turborepo) + `@m/shared` (Money/enums/zod) + `@m/db` (Prisma+seed, Postgres+Redis в Docker) + `@m/api` (NestJS: health, Telegram-initData auth+JWT, `POST /estimate` через k-anon `BenchmarkReader`). Анонимная ₽-смета работает end-to-end (вживую: 80 гостей msk/zags/mid → 1 040 000 ₽, честные seed-метки «Ориентир (2026)»). Тесты: `@m/shared` 7, `@m/api` 17, `@m/db` seed 2 — все зелёные. Прошло spec+quality+final ревью.
- ✅ **План 2 реализован и смёржен в main** (subagent-driven, merge `aa16037`, 2026-05-30). Acquisition-спина: save-as-budget (`POST /projects` + `ProjectService` транзакцией), идемпотентный `SpendFactService` (один факт на project+category), crowd-агрегация (винзоризация+перцентили через BullMQ `CrowdAggregator`/`AggregationModule`), публичная `GET /public/showcase` (через k-anon `BenchmarkReader`, Redis-кэш TTL 600 + `Cache-Control s-maxage`), `RateLimitGuard` (Redis fixed-window, на estimate+showcase), `MetricsService` (`@Global`, инкременты в контроллерах), и `apps/miniapp` (Next.js: UX сметы + share-ссылка + публичные SSR `/showcase` и OG `/s/[preset]`). Вживую: `/public/showcase` → 200 + cache + 7 seed-айтемов, estimate → 201 через rate-limit, miniapp билдится. Тесты: `@m/shared` 7, `@m/api` **31**, miniapp build/typecheck — зелёные (turbo 8/8). Прошло по-блочные spec+quality ревью + холистическую проверку инвариантов.
- ✅ **План 3 реализован и смёржен в main** (subagent-driven, merge `60cb46e`, 2026-05-30). Планировщик: бюджет-трекер + платежи с **optimistic-lock** (409), платежи дёргают `SpendFactService.recompute` (enqueue на upsert+delete), делегирование **secure invite-токеном** (атомарный one-time claim в транзакции + authz владельца), ЗАГС/таймлайн-чеклист (compliance: source/review/city) инстанцируется при создании проекта, камерный режим (format-profile). **Authz:** все budget/checklist пути проверяют членство в проекте (`assertMember`). Тесты: `@m/api` **60**, `@m/shared` 7, `@m/db` 4 — зелёные (turbo 8/8). Прошло по-блочные + финальное ревью (финал поймал и закрыл authz-дыру на budget/checklist).
- ✅ **План 4 реализован и смёржен в main** (subagent-driven, merge `9973229`, 2026-05-30). Напоминания + 152-ФЗ: `apps/bot` (grammY `makeBot`); надёжная доставка `ReminderDelivery` (статус sent|blocked|failed; blocked→без ретрая, 429/прочее→ретрай); `ReminderScheduler` (BullMQ delayed, 5 попыток, exp backoff 30с) — врезан в `ChecklistService.instantiate`; видимый fallback `DeadlinesService.upcoming` (view checklist_items done:false/ackAt:null) + `ack`-дедуп (§12.9); 152-ФЗ `ConsentService` (grant/has) + `DeletionService` (owner-authz, purge spend_facts перед каскадом в транзакции); квартальный `refreshSeed` (bigint, идемпотентный); **3 критичных integration-теста** (§12.14: упавшее напоминание→fallback, k-anon sub-threshold→seed, invite expired/reused/revoked→reject). Send-примитивы (`sendReminder`/`telegramFetchSender` через Node-fetch, без grammy в api) живут в `@m/shared`. Вживую: build RC=0, `/health` 200, NotificationModule+Consent замаплены, deadlines/consent→401. Тесты: `@m/shared` **10**, `@m/api` **77**, `@m/bot` 3 (turbo 10/10). Прошло по-блочные + финальное ревью (поймало и закрыло `@m/bot` build/runtime BLOCKER).

### 🎉 v1 ЗАВЕРШЁН — все 4 плана в main
Полный путь Фаза 0 + ядро Фазы 1: анонимная смета → виральная петля + сбор данных → планировщик (бюджет/делегирование/чеклист) → напоминания + 152-ФЗ. Стек: монорепо (api/miniapp/bot + shared/db), все тесты зелёные (turbo 10/10), api build RC=0, рантайм бутстрапится.

**Известные follow-up до прода (в `docs/TODOS.md`):** (1) ESM-source-workspace для контейнерного деплоя (api build/start локально RC=0, но образ требует внимания); (2) платёж+recompute не транзакционны → outbox/after-commit enqueue; (3) ~~consent enforcement~~ ✅ сделано (ConsentGuard, доказано рантаймом 403→201; merge 8442153, fix-chain 4087f18→fd471e2→9c50790); (4) share-URL port-rewrite в miniapp → `NEXT_PUBLIC_WEB_URL`; (5) ЗАГС-шаблоны: human verify-before-launch (named owner, §12.12); (6) reminder send-hour (03:00 МСК) + skip past-reminders; (7) `apps/bot` собственный prod build не прогонялся (api — деплой-точка напоминаний, шлёт через fetch); (8) `AggregationModule` worker не смонтирован в AppModule (Plan 2, crowd-recompute не крутится в api-процессе).

**Запуск dev (локально):** Docker на нестандартных портах (5440/6390) через `infra/docker-compose.yml`; `DATABASE_URL`/`REDIS_URL` в gitignored `.env` (порты заняты другими проектами на сервере). vitest/prisma грузят `.env` сами; dev-сервер — `@swc-node/register` (нужен для NestJS decorator-metadata, esbuild/tsx его не эмитит). Smoke: `set -a; . ./.env; set +a; PORT=3001 pnpm --filter @m/api dev` → `POST /estimate`.

**Следующий шаг:** v1 функционально готов. Перед запуском в прод — пройтись по follow-up из `docs/TODOS.md` (приоритет: контейнерный деплой/ESM, server-side consent enforcement, ЗАГС human-verify), кастдев/наполнение seed, реальный BOT_TOKEN + домен. Дальше по дорожной карте — Фаза 2 (слой доверия: верификация подрядчиков, безопасная сделка, монетизация) — отдельный спек-цикл.

---

## 8. Важные правила/контекст

- Язык общения: русский. Комментарии в коде: английский. Коммиты: conventional, английский.
- **Не привязывать решения к проекту Cortex** (явное указание пользователя; Cortex-ссылка из спека убрана).
- Файлы кода < 500 строк; DDD bounded contexts; TDD London (mock-first).
- 152-ФЗ: хостинг и БД с перс.данными граждан РФ — на серверах в РФ.

## 9. Открытые параметры (решить при реализации)

- `N_threshold` (seed→crowd и k-anon), стартовая гипотеза 5–10.
- Окно `auth_date` (24ч), TTL session-JWT (1ч), TTL инвайта (7 дней).
- Точные seed-вилки по категориям; полный список `checklist_templates` (верификация ЗАГС МСК/СПб).
- Кадэнс quarterly seed-refresh; лимиты rate-limit.
- BotUsername, BOT_TOKEN, деплой-конфиг.
