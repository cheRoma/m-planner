import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { PaymentService } from "./payment.service";

function fakePrisma() {
  return {
    payment: {
      create: vi.fn(async ({ data }: any) => ({ id: "pay1", version: 0, ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => ({ id: "pay1", version: 1, budgetItemId: "b1" })),
      delete: vi.fn(async () => ({ id: "pay1", budgetItemId: "b1" })),
    },
    budgetItem: { findUniqueOrThrow: vi.fn(async () => ({ id: "b1", projectId: "p1", categoryId: "c1" })) },
    projectMember: {
      findUnique: vi.fn(async () => ({ projectId: "p1", userId: "u1", role: "owner" })),
    },
  } as any;
}

describe("PaymentService", () => {
  it("creates a payment and recomputes the spend fact for its (project,category)", async () => {
    const prisma = fakePrisma();
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await svc.addPayment("b1", "u1", { type: "prepay", amount: "50000000", payer: "couple" });
    expect(prisma.payment.create).toHaveBeenCalled();
    expect(spend.recompute).toHaveBeenCalledWith("p1", "c1");
  });

  it("recomputes after deleting a payment", async () => {
    const prisma = fakePrisma();
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await svc.deletePayment("pay1", "u1");
    expect(spend.recompute).toHaveBeenCalledWith("p1", "c1");
  });

  it("rejects a non-member with ForbiddenException (addPayment)", async () => {
    const prisma = fakePrisma();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await expect(svc.addPayment("b1", "intruder", { type: "prepay", amount: "100", payer: "couple" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("rejects a non-member with ForbiddenException (deletePayment)", async () => {
    const prisma = fakePrisma();
    prisma.projectMember.findUnique.mockResolvedValue(null);
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await expect(svc.deletePayment("pay1", "intruder")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.payment.delete).not.toHaveBeenCalled();
  });
});
