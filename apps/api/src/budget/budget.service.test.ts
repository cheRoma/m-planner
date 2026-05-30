import { describe, it, expect, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { BudgetService } from "./budget.service";

function fakePrisma() {
  return {
    budgetItem: {
      create: vi.fn(async ({ data }: any) => ({ id: "b1", version: 0, ...data })),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(async () => ({ id: "b1", version: 1, projectId: "p1", plannedAmount: 100n })),
    },
    projectMember: {
      findUnique: vi.fn(async () => ({ projectId: "p1", userId: "u1", role: "owner" })),
    },
  } as any;
}

describe("BudgetService", () => {
  it("creates a budget item", async () => {
    const prisma = fakePrisma();
    const svc = new BudgetService(prisma);
    const item = await svc.addItem("p1", "u1", { categoryId: "c1", plannedAmount: "100", vendorName: "Foto" });
    expect(item.id).toBe("b1");
    expect(prisma.budgetItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: "p1", plannedAmount: 100n }) }),
    );
  });

  it("updates with version, 409 on stale version", async () => {
    const prisma = fakePrisma();
    prisma.budgetItem.updateMany.mockResolvedValue({ count: 0 });
    const svc = new BudgetService(prisma);
    await expect(svc.updateItem("b1", "u1", 0, { plannedAmount: "200" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a non-member with ForbiddenException (addItem)", async () => {
    const prisma = fakePrisma();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const svc = new BudgetService(prisma);
    await expect(svc.addItem("p1", "intruder", { categoryId: "c1", plannedAmount: "100" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.budgetItem.create).not.toHaveBeenCalled();
  });

  it("rejects a non-member with ForbiddenException (updateItem)", async () => {
    const prisma = fakePrisma();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const svc = new BudgetService(prisma);
    await expect(svc.updateItem("b1", "intruder", 0, { plannedAmount: "200" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.budgetItem.updateMany).not.toHaveBeenCalled();
  });
});
