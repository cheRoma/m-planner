# TODOS — m-planner

Отложенная работа с контекстом. Источник решений: CEO-ревью (§11) и Eng-ревью (§12) спека
`docs/superpowers/specs/2026-05-29-wedding-planner-telegram-design.md`.

---

## 🚀 Pre-prod чеклист (v1 кодом готов, merge `9973229`)

Блокеры/важное перед запуском в прод (детали — в секциях ниже + ниже по файлу):
- [ ] **Контейнерный деплой / ESM-source-workspace** — `pnpm --filter @m/api build` RC=0 локально, но образ требует решения резолюции workspace-пакетов (`@m/shared`/`@m/db` отдают сырой `.ts`). См. [Build].
- [ ] **Server-side consent enforcement (152-ФЗ)** — consent сейчас только записывается (`ConsentService`), не enforced. Добавить guard, требующий `ConsentService.has(userId)` перед созданием проекта → 403. Прямой API-вызов сейчас обходит.
- [ ] **ЗАГС human-verify-before-launch** — named owner сверяет `checklist_templates(kind=zags)` МСК+СПб по рег-источникам (source_url сейчас на корни mos.ru/gu.spb.ru, не на конкретные правила). §12.12.
- [ ] **Платёж+recompute → outbox** — не транзакционны (см. ниже).
- [ ] **miniapp share-URL** → `NEXT_PUBLIC_WEB_URL` (см. ниже).
- [ ] **reminder send-hour** — `reminderAt` сейчас 03:00 МСК (артефакт UTC-полуночи weddingDate) + нет skip past-reminders. Нормализовать send-hour, пропускать прошедшие.
- [ ] **AggregationModule worker не смонтирован** в AppModule (Plan 2) — crowd-recompute enqueue'ится (BudgetModule queue-only), но воркер не крутится в api-процессе. Смонтировать отдельный worker-процесс или добавить в API.
- [ ] Реальный `BOT_TOKEN`, домен, прод-`.env`, сидинг seed-цен (кастдев).

---

## [Eng OV#1] Cold-start моата: цель по spend_facts + укрупнённые срезы

- **Что:** До того как полагаться на crowd-витрину как на реальный канал/соцдоказательство — задать конкретный целевой объём `spend_facts` по срезам и стратегию укрупнения срезов при малых N.
- **Почему:** Моат разблокируется посрезово: ~84 среза (`category × city × tier × format`), каждому нужно 5–10 реальных свадеб. На TG-канале и сжимающемся рынке (~880k браков, тренд вниз) отдельный срез разблокируется месяцами. Первые месяцы витрина почти вся seed.
- **Pros:** Реалистичные ожидания по моату; витрина быстрее показывает crowd, если срезы укрупнять.
- **Cons:** Укрупнение срезов снижает точность («средняя по городу» вместо «budget-свадьба на 50 гостей»).
- **Контекст:** Честная маркировка seed vs crowd (§12.4) уже снимает риск обмана. Это про скорость наполнения, не про честность. Идея: при `N < threshold` по полному срезу — деградировать к укрупнённому (`city+format`, затем `+tier`), показывая, насколько агрегат укрупнён.
- **Depends on:** `BenchmarkReader` (§12.2), объём `spend_facts` из трекера.

## [Build] Production build/start у @m/api (ESM-source-workspace)

- **Что:** `pnpm --filter @m/api build` (tsc) проходит, но `node dist/main.js` (`start`) падает с `ERR_MODULE_NOT_FOUND`: Node ESM требует явные `.js`-расширения в относительных импортах, а workspace-пакеты `@m/shared`/`@m/db` отдают сырой `.ts` через `main`. dev-сервер работает (через `@swc-node/register`), прод-сборка — нет.
- **Почему:** Нужно для деплоя (Docker/прод). Сейчас не блокирует разработку (dev + тесты зелёные).
- **Варианты:** (a) бандлить app через tsup/esbuild в один CJS/ESM-файл; (b) собирать `@m/shared`/`@m/db` в JS (`dist`) + `exports`-мапы и указывать `main`/`types` на `dist`; (c) `tsx`/swc-node как прод-рантайм (проще, но без тру-сборки).
- **Контекст:** Появилось в Плане 1 (NestJS+ESM-source-workspace). Решать перед первым деплоем. См. `apps/api/package.json` (`build`/`start`), `packages/{shared,db}/package.json` (`main` → `./src/index.ts`).

## [Plan 3 → Plan 4] Транзакционность платёж + spend_fact recompute (outbox)

- **Что:** `PaymentService.addPayment/deletePayment/updatePayment` сначала коммитят платёж, затем вызывают `SpendFactService.recompute` (который enqueue'ит crowd-пересчёт). Эти два шага НЕ в одной транзакции: если recompute/enqueue упадёт (Redis down), платёж уже сохранён, API вернёт 500, а spend_fact/crowd-бенчмарк останется устаревшим.
- **Почему:** Финансовый путь; при сбое инфры — тихая рассинхронизация моат-данных.
- **Варианты:** (a) обернуть `payment.create` + spend_fact-апдейт в один `prisma.$transaction`, а enqueue сделать after-commit/outbox-шагом (failure enqueue не валит коммит); (b) transactional outbox-таблица + воркер. Естественно решать в Плане 4 вместе с durable-доставкой напоминаний (тот же паттерн).
- **Контекст:** Поймано финальным ревью Плана 3. Не блокер (нет коррупции, только transient-staleness), но закрыть до реальных пользователей. См. `apps/api/src/budget/payment.service.ts`.

## [Plan 3] Authz-паттерн: assertMember на ресурсных эндпоинтах

- **Что:** Введён `apps/api/src/auth/assert-member.ts` — проверка членства в проекте перед доступом к budget/checklist. **Правило для будущих ресурсных эндпоинтов:** `JwtGuard` даёт только личность; любой эндпоинт с `:projectId`/`:itemId` обязан звать `assertMember(prisma, projectId, userId)` (или резолвить projectId и звать) — иначе любой залогиненный юзер дотянется до чужого проекта. Финальное ревью Плана 3 поймало эту дыру (budget/checklist были без проверки) — не повторять в Плане 4 (reminder/consent/deadlines-эндпоинты тоже ресурсные).

## [CEO 11.9] Чёрный список подрядчиков (lite)

- **Что:** Лёгкий намёк на боль №1 (доверие) — пометки/жалобы на подрядчиков.
- **Почему:** Боль №1 (9/10), но это территория Фазы 2.
- **Cons / blocked by:** Юр-риски диффамации; нужен supply (подрядчики в системе), которого в v1 нет.
- **Контекст:** Сознательно вне v1. Открывать вместе с верификацией подрядчиков и слоем доверия (Фаза 2).
