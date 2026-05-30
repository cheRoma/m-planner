import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { updateWithVersion } from "./optimistic";

@Injectable()
export class BudgetService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async addItem(projectId: string, input: { categoryId: string; plannedAmount: string; vendorName?: string }) {
    return this.prisma.budgetItem.create({
      data: { projectId, categoryId: input.categoryId, plannedAmount: BigInt(input.plannedAmount), vendorName: input.vendorName ?? null },
    });
  }

  async updateItem(id: string, expectedVersion: number, patch: { plannedAmount?: string; vendorName?: string; status?: string }) {
    const data: Record<string, unknown> = {};
    if (patch.plannedAmount !== undefined) data.plannedAmount = BigInt(patch.plannedAmount);
    if (patch.vendorName !== undefined) data.vendorName = patch.vendorName;
    if (patch.status !== undefined) data.status = patch.status;
    return updateWithVersion(this.prisma.budgetItem as any, id, expectedVersion, data);
  }
}
