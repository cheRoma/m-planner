import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { updateWithVersion } from "./optimistic";
import { SpendFactService } from "../spend/spend-fact.service";
import { assertMember } from "../auth/assert-member";

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

  // Resolves the owning project for a budget item and asserts membership.
  private async assertItemMember(budgetItemId: string, userId: string) {
    const item = await this.prisma.budgetItem.findUniqueOrThrow({ where: { id: budgetItemId } });
    await assertMember(this.prisma, item.projectId, userId);
  }

  async addPayment(budgetItemId: string, userId: string, input: { type: string; amount: string; payer: string; dueDate?: string; paidAt?: string }) {
    await this.assertItemMember(budgetItemId, userId);
    const payment = await this.prisma.payment.create({
      data: {
        budgetItemId, type: input.type, amount: BigInt(input.amount), payer: input.payer,
        dueDate: input.dueDate ? new Date(input.dueDate) : null, paidAt: input.paidAt ? new Date(input.paidAt) : null,
      },
    });
    await this.recomputeFor(budgetItemId);
    return payment;
  }

  async updatePayment(id: string, userId: string, expectedVersion: number, patch: { amount?: string; paidAt?: string }) {
    const existing = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    await this.assertItemMember(existing.budgetItemId, userId);
    const data: Record<string, unknown> = {};
    if (patch.amount !== undefined) data.amount = BigInt(patch.amount);
    if (patch.paidAt !== undefined) data.paidAt = new Date(patch.paidAt);
    const updated = await updateWithVersion<{ budgetItemId: string }>(this.prisma.payment as any, id, expectedVersion, data);
    await this.recomputeFor(updated.budgetItemId);
    return updated;
  }

  async deletePayment(id: string, userId: string) {
    const existing = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    await this.assertItemMember(existing.budgetItemId, userId);
    const deleted = await this.prisma.payment.delete({ where: { id } });
    await this.recomputeFor(deleted.budgetItemId);
    return { ok: true };
  }
}
