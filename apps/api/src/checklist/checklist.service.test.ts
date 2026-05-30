import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { ChecklistService } from "./checklist.service";

function fakeScheduler() {
  return { schedule: vi.fn(async () => {}) } as any;
}

function fakePrisma(templates: any[]) {
  return {
    weddingProject: { findUniqueOrThrow: vi.fn(async () => ({ id: "p1", city: "msk", format: "zags", weddingDate: new Date("2026-09-01") })) },
    checklistTemplate: { findMany: vi.fn(async () => templates) },
    checklistItem: {
      createMany: vi.fn(async () => ({ count: templates.length })),
      findMany: vi.fn(async () => []),
      findUniqueOrThrow: vi.fn(async () => ({ id: "ci1", projectId: "p1" })),
      update: vi.fn(async ({ data }: any) => ({ id: "ci1", projectId: "p1", ...data })),
    },
    projectMember: {
      findUnique: vi.fn(async () => ({ projectId: "p1", userId: "u1", role: "owner" })),
    },
  } as any;
}

describe("ChecklistService.instantiate", () => {
  it("creates items with due_date = wedding_date - offset and reminder_at", async () => {
    const prisma = fakePrisma([
      { key: "zags_application_msk", title: "Подать заявление", offsetDaysBeforeWedding: 35, city: "msk" },
      { key: "book_photo", title: "Фотограф", offsetDaysBeforeWedding: 180, city: null },
    ]);
    const svc = new ChecklistService(prisma, fakeScheduler());
    await svc.instantiate("p1");
    const call = prisma.checklistItem.createMany.mock.calls[0][0];
    const zags = call.data.find((d: any) => d.templateKey === "zags_application_msk");
    // 2026-09-01 minus 35 days = 2026-07-28
    expect(new Date(zags.dueDate).toISOString().slice(0, 10)).toBe("2026-07-28");
    expect(zags.reminderAt).toBeTruthy();
  });

  it("schedules a reminder for each created item with a reminder_at", async () => {
    const prisma = fakePrisma([
      { key: "zags_application_msk", title: "Подать заявление", offsetDaysBeforeWedding: 35, city: "msk" },
    ]);
    prisma.checklistItem.findMany.mockResolvedValue([
      { id: "ci1", projectId: "p1", reminderAt: new Date("2026-07-25") },
      { id: "ci2", projectId: "p1", reminderAt: null }, // no reminder → not scheduled
    ]);
    const scheduler = fakeScheduler();
    const svc = new ChecklistService(prisma, scheduler);
    await svc.instantiate("p1");
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);
    expect(scheduler.schedule).toHaveBeenCalledWith({ id: "ci1", reminderAt: new Date("2026-07-25") });
  });

  it("uses the format-specific checklist branch (kamernaya skips host)", async () => {
    const prisma = fakePrisma([{ key: "book_host", title: "Ведущий", offsetDaysBeforeWedding: 180, city: null }]);
    prisma.weddingProject.findUniqueOrThrow.mockResolvedValue({ id: "p1", city: "msk", format: "kamernaya", weddingDate: new Date("2026-09-01") });
    const svc = new ChecklistService(prisma, fakeScheduler());
    await svc.instantiate("p1");
    // book_host not requested for kamernaya → findMany called with keys excluding it
    const where = prisma.checklistTemplate.findMany.mock.calls[0][0].where;
    expect(where.key.in).not.toContain("book_host");
  });
});

describe("ChecklistService authz", () => {
  it("lists items for a member", async () => {
    const prisma = fakePrisma([]);
    const svc = new ChecklistService(prisma, fakeScheduler());
    await svc.list("p1", "u1");
    expect(prisma.checklistItem.findMany).toHaveBeenCalledWith({ where: { projectId: "p1" }, orderBy: { dueDate: "asc" } });
  });

  it("rejects list for a non-member with ForbiddenException", async () => {
    const prisma = fakePrisma([]);
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const svc = new ChecklistService(prisma, fakeScheduler());
    await expect(svc.list("p1", "intruder")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.checklistItem.findMany).not.toHaveBeenCalled();
  });

  it("sets done for a member via the service", async () => {
    const prisma = fakePrisma([]);
    const svc = new ChecklistService(prisma, fakeScheduler());
    await svc.setDone("ci1", "u1", true);
    expect(prisma.checklistItem.update).toHaveBeenCalledWith({ where: { id: "ci1" }, data: { done: true } });
  });

  it("rejects setDone for a non-member with ForbiddenException", async () => {
    const prisma = fakePrisma([]);
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const svc = new ChecklistService(prisma, fakeScheduler());
    await expect(svc.setDone("ci1", "intruder", true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.checklistItem.update).not.toHaveBeenCalled();
  });
});
