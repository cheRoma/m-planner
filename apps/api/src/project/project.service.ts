import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { ChecklistService } from "../checklist/checklist.service";

export interface CreateProjectInput {
  city: string; format: string; tier: string; guests: number; weddingDate: string;
  lines: { categorySlug: string; plannedAmount: string }[]; // kopecks as string
}

@Injectable()
export class ProjectService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    private readonly checklist: ChecklistService,
  ) {}

  async createFromEstimate(userId: string, input: CreateProjectInput): Promise<{ projectId: string }> {
    const { projectId } = await this.prisma.$transaction(async (tx) => {
      const project = await tx.weddingProject.create({
        data: {
          ownerId: userId, city: input.city, weddingDate: new Date(input.weddingDate),
          format: input.format, guestCount: input.guests, tier: input.tier,
        },
      });
      await tx.projectMember.create({ data: { projectId: project.id, userId, role: "owner" } });
      const categories = await tx.category.findMany({ where: { slug: { in: input.lines.map((l) => l.categorySlug) } } });
      const idBySlug = new Map(categories.map((c) => [c.slug, c.id]));
      await tx.budgetItem.createMany({
        data: input.lines.flatMap((l) => {
          const categoryId = idBySlug.get(l.categorySlug);
          return categoryId ? [{ projectId: project.id, categoryId, plannedAmount: BigInt(l.plannedAmount) }] : [];
        }),
      });
      return { projectId: project.id };
    });
    // §5.4: instantiate the checklist for the new project (by wedding_date + format branch).
    await this.checklist.instantiate(projectId);
    return { projectId };
  }
}
