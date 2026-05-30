import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { updateWithVersion } from "./optimistic";
import { SpendFactService } from "../spend/spend-fact.service";

@Injectable()
export class PaymentService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly spend: SpendFactService,
  ) {}

  private async recomputeFor(budgetItemId: string) {
    const item = await this.prisma.budgetItem.findUniqueOrThrow({ where: { id: budgetItemId } });
    await this.spend.recompute(item.projectId, item.categoryId);
  }

  async addPayment(budgetItemId: string, input: { type: string; amount: string; payer: string; dueDate?: string; paidAt?: string }) {
    const payment = await this.prisma.payment.create({
      data: {
        budgetItemId, type: input.type, amount: BigInt(input.amount), payer: input.payer,
        dueDate: input.dueDate ? new Date(input.dueDate) : null, paidAt: input.paidAt ? new Date(input.paidAt) : null,
      },
    });
    await this.recomputeFor(budgetItemId);
    return payment;
  }

  async updatePayment(id: string, expectedVersion: number, patch: { amount?: string; paidAt?: string }) {
    const data: Record<string, unknown> = {};
    if (patch.amount !== undefined) data.amount = BigInt(patch.amount);
    if (patch.paidAt !== undefined) data.paidAt = new Date(patch.paidAt);
    const updated = await updateWithVersion<{ budgetItemId: string }>(this.prisma.payment as any, id, expectedVersion, data);
    await this.recomputeFor(updated.budgetItemId);
    return updated;
  }

  async deletePayment(id: string) {
    const deleted = await this.prisma.payment.delete({ where: { id } });
    await this.recomputeFor(deleted.budgetItemId);
    return { ok: true };
  }
}
