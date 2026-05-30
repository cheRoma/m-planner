import { Body, Controller, Get, Param, Patch, Req, UseGuards, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { ChecklistService } from "./checklist.service";

const PatchDone = z.object({ done: z.boolean() });

@Controller()
@UseGuards(JwtGuard)
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  @Get("projects/:id/checklist")
  list(@Param("id") projectId: string, @Req() req: { userId: string }) { return this.checklist.list(projectId, req.userId); }

  @Patch("checklist/:itemId")
  async patch(@Param("itemId") itemId: string, @Body() body: unknown, @Req() req: { userId: string }) {
    const parsed = PatchDone.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.checklist.setDone(itemId, req.userId, parsed.data.done);
  }
}
