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
