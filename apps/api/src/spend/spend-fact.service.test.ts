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
