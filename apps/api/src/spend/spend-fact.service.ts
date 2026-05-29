import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";

/**
 * §12.7: exactly one spend_fact per (project, category). Recompute from the
 * summed payments of all budget_items in that category. project_id is stored
 * for upsert/delete only and is EXCLUDED from aggregates (Plan 2 crowd query).
 */
@Injectable()
export class SpendFactService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async recompute(projectId: string, categoryId: string): Promise<void> {
    const sum = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: { budgetItem: { projectId, categoryId } },
    });
    const total = sum._sum.amount;
    if (!total || total <= 0n) {
      await this.prisma.spendFact.deleteMany({ where: { projectId, categoryId } });
      return;
    }
    const project = await this.prisma.weddingProject.findUniqueOrThrow({ where: { id: projectId } });
    await this.prisma.spendFact.upsert({
      where: { projectId_categoryId: { projectId, categoryId } },
      update: { amount: total, city: project.city, tier: project.tier, format: project.format, guestCount: project.guestCount },
      create: {
        projectId, categoryId, amount: total,
        city: project.city, tier: project.tier, format: project.format, guestCount: project.guestCount,
      },
    });
  }
}
