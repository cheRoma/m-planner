import { describe, it, expect, vi } from "vitest";
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
  } as any;
}

describe("PaymentService", () => {
  it("creates a payment and recomputes the spend fact for its (project,category)", async () => {
    const prisma = fakePrisma();
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await svc.addPayment("b1", { type: "prepay", amount: "50000000", payer: "couple" });
    expect(prisma.payment.create).toHaveBeenCalled();
    expect(spend.recompute).toHaveBeenCalledWith("p1", "c1");
  });

  it("recomputes after deleting a payment", async () => {
    const prisma = fakePrisma();
    const spend = { recompute: vi.fn(async () => {}) } as any;
    const svc = new PaymentService(prisma, spend);
    await svc.deletePayment("pay1");
    expect(spend.recompute).toHaveBeenCalledWith("p1", "c1");
  });
});
