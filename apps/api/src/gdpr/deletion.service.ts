import { Injectable, Inject, ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@m/db";

/**
 * §11.4/§12.7: right to delete. spend_facts are intentionally un-linked from users
 * in aggregates, but carry project_id for exactly this purge. Delete them first,
 * then delete the project (cascades members/budget/payments/checklist).
 */
@Injectable()
export class DeletionService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async deleteProject(projectId: string, userId: string): Promise<void> {
    // Deletion is destructive: require the OWNER, not merely any member.
    // JwtGuard proves identity only — without this check any authenticated
    // user could delete any project.
    const project = await this.prisma.weddingProject.findUnique({ where: { id: projectId } });
    if (!project || project.ownerId !== userId) {
      throw new ForbiddenException("not project owner");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.spendFact.deleteMany({ where: { projectId } });
      await tx.weddingProject.delete({ where: { id: projectId } });
    });
  }
}
