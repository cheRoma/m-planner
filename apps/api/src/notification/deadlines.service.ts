import { Injectable, Inject, Optional } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { Clock } from "../invite/invite.service";
import { assertMember } from "../auth/assert-member";

/**
 * §11.5/§12.9: the Mini App fallback is a VIEW over the same checklist_items
 * (single source of truth), not an independent trigger. ack() sets ackAt which
 * both the push worker (skips) and this view honor → deadline communicated once.
 */
@Injectable()
export class DeadlinesService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient, @Optional() @Inject("CLOCK") private readonly clock?: Clock) {}

  async upcoming(projectId: string, userId: string) {
    await assertMember(this.prisma, projectId, userId);
    const rows = await this.prisma.checklistItem.findMany({
      where: { projectId, done: false, ackAt: null }, orderBy: { dueDate: "asc" },
    });
    return rows.map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate, reminderStatus: r.reminderStatus }));
  }

  async ack(checklistItemId: string, userId: string): Promise<void> {
    const item = await this.prisma.checklistItem.findUniqueOrThrow({ where: { id: checklistItemId } });
    await assertMember(this.prisma, item.projectId, userId);
    const now = this.clock?.nowMs() ?? Date.now();
    await this.prisma.checklistItem.update({ where: { id: checklistItemId }, data: { ackAt: new Date(now) } });
  }
}
