import { Body, Controller, Get, Param, Patch, UseGuards, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { ChecklistService } from "./checklist.service";
import { prisma } from "@m/db";

const PatchDone = z.object({ done: z.boolean() });

@Controller()
@UseGuards(JwtGuard)
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  @Get("projects/:id/checklist")
  list(@Param("id") projectId: string) { return this.checklist.list(projectId); }

  @Patch("checklist/:itemId")
  async patch(@Param("itemId") itemId: string, @Body() body: unknown) {
    const parsed = PatchDone.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return prisma.checklistItem.update({ where: { id: itemId }, data: { done: parsed.data.done } });
  }
}
