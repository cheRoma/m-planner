import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@m/db";
import { BotBlockedError } from "@m/shared";
import { seed } from "../../../packages/db/prisma/seed";
import { ReminderDelivery } from "../src/notification/reminder-delivery";
import { BenchmarkReader } from "../src/estimate/benchmark-reader";
import { InviteService } from "../src/invite/invite.service";

beforeAll(async () => { await seed(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("CRITICAL PATH 1 — reminder fail → status → visible in fallback (§12.14.1)", () => {
  it("blocked bot marks status=blocked and the deadline still surfaces in deadlines view", async () => {
    const owner = await prisma.user.create({ data: { telegramId: BigInt(Date.now()) } });
    const project = await prisma.weddingProject.create({
      data: { ownerId: owner.id, city: "msk", weddingDate: new Date("2026-09-01"), format: "zags", guestCount: 50, tier: "mid" },
    });
    await prisma.checklistTemplate.upsert({
      where: { key: "zags_application_msk" },
      update: {},
      create: { key: "zags_application_msk", title: "Подать заявление", kind: "zags", offsetDaysBeforeWedding: 35 },
    });
    const item = await prisma.checklistItem.create({
      data: { projectId: project.id, templateKey: "zags_application_msk", title: "Подать заявление", dueDate: new Date("2026-07-28"), reminderAt: new Date("2026-07-25") },
    });

    // Real ctor is (prisma, sendFn) via DI tokens; direct instantiation matches that order.
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
    // Real ctor is (prisma, { threshold }) via DI tokens.
    const reader = new BenchmarkReader(prisma as any, { threshold: 5 });
    const res = await reader.getAggregates({ city: "msk", tier: "mid", format: "zags" } as any, ["banquet"]);
    const agg = res.get("banquet");
    expect(agg && "source" in agg && agg.source).toBe("seed"); // NOT the 2-sample crowd row
  });
});

describe("CRITICAL PATH 3 — invite token expired/revoked/reused is rejected (§12.14.3)", () => {
  // Real ctor is (prisma, clock) via DI tokens; clock exposes nowMs().
  const clock = { nowMs: () => Date.parse("2026-06-01T00:00:00Z") };
  it("rejects expired, revoked, and already-used tokens", async () => {
    const owner = await prisma.user.create({ data: { telegramId: BigInt(Date.now() + 1) } });
    const partner = await prisma.user.create({ data: { telegramId: BigInt(Date.now() + 2) } });
    const project = await prisma.weddingProject.create({
      data: { ownerId: owner.id, city: "msk", weddingDate: new Date("2026-09-01"), format: "zags", guestCount: 50, tier: "mid" },
    });
    const svc = new InviteService(prisma as any, clock as any);

    // expired — Plan 3 hardened accept() into an atomic claim that collapses
    // expired/revoked/already-used into a single ForbiddenException("invite not usable").
    const expired = await prisma.inviteToken.create({
      data: { token: `exp_${Date.now()}`, projectId: project.id, role: "partner", expiresAt: new Date("2026-05-01") },
    });
    await expect(svc.accept(expired.token, partner.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.accept(expired.token, partner.id)).rejects.toThrow(/not usable/);

    // happy then reuse — create now takes the owner's userId (ownership enforced).
    const fresh = await svc.create(project.id, owner.id, 7);
    await svc.accept(fresh.token, partner.id);
    await expect(svc.accept(fresh.token, partner.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.accept(fresh.token, partner.id)).rejects.toThrow(/not usable/);

    // revoked — revoke now takes the owner's userId (ownership enforced).
    const r = await svc.create(project.id, owner.id, 7);
    await svc.revoke(r.token, owner.id);
    await expect(svc.accept(r.token, partner.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.accept(r.token, partner.id)).rejects.toThrow(/not usable/);
  });
});
