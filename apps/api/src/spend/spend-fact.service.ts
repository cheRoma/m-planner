import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { Queue } from "bullmq";
import type { SliceKey } from "../aggregation/crowd-aggregator";

/**
 * §12.7: exactly one spend_fact per (project, category). Recompute from the
 * summed payments of all budget_items in that category. project_id is stored
 * for upsert/delete only and is EXCLUDED from aggregates (Plan 2 crowd query).
 */
@Injectable()
export class SpendFactService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("AGG_QUEUE") private readonly queue: Queue<SliceKey>,
  ) {}

  async recompute(projectId: string, categoryId: string): Promise<void> {
    const sum = await this.prisma.payment.aggregate({
      _sum: { amount: true },
      where: { budgetItem: { projectId, categoryId } },
    });
    const total = sum._sum.amount;
    const project = await this.prisma.weddingProject.findUniqueOrThrow({ where: { id: projectId } });

    if (!total || total <= 0n) {
      // Delete-path: a removed/zeroed payment must drop the fact AND refresh the
      // crowd benchmark for that slice — otherwise the benchmark stays stale (§12.7).
      await this.prisma.spendFact.deleteMany({ where: { projectId, categoryId } });
      await this.enqueueSlice(categoryId, project);
      return;
    }
    await this.prisma.spendFact.upsert({
      where: { projectId_categoryId: { projectId, categoryId } },
      update: { amount: total, city: project.city, tier: project.tier, format: project.format, guestCount: project.guestCount },
      create: {
        projectId, categoryId, amount: total,
        city: project.city, tier: project.tier, format: project.format, guestCount: project.guestCount,
      },
    });
    await this.enqueueSlice(categoryId, project);
  }

  // Enqueue a crowd-benchmark recompute for the affected slice (Plan 2 Task 7 Step 5).
  private async enqueueSlice(
    categoryId: string,
    project: { city: string; tier: string; format: string },
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (category) {
      await this.queue.add("slice", {
        categorySlug: category.slug,
        city: project.city,
        tier: project.tier,
        format: project.format,
      });
    }
  }
}
