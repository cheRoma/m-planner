import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { City, WeddingFormat } from "@m/shared";
import { checklistKeysForFormat } from "../estimate/format-profile";

const DAY_MS = 86400 * 1000;
const REMINDER_LEAD_DAYS = 3; // напомнить за 3 дня до due_date

@Injectable()
export class ChecklistService {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async instantiate(projectId: string): Promise<void> {
    const project = await this.prisma.weddingProject.findUniqueOrThrow({ where: { id: projectId } });
    const keys = checklistKeysForFormat(project.format as WeddingFormat, project.city as City);
    const templates = await this.prisma.checklistTemplate.findMany({ where: { key: { in: keys } } });

    const data = templates.map((t) => {
      const dueDate = new Date(project.weddingDate.getTime() - t.offsetDaysBeforeWedding * DAY_MS);
      const reminderAt = new Date(dueDate.getTime() - REMINDER_LEAD_DAYS * DAY_MS);
      return { projectId, templateKey: t.key, title: t.title, dueDate, reminderAt };
    });
    await this.prisma.checklistItem.createMany({ data });
  }

  async list(projectId: string) {
    return this.prisma.checklistItem.findMany({ where: { projectId }, orderBy: { dueDate: "asc" } });
  }
}
