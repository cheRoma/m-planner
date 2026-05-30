import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { DeadlinesService } from "./deadlines.service";

@Controller()
@UseGuards(JwtGuard)
export class NotificationController {
  constructor(private readonly deadlines: DeadlinesService) {}
  @Get("projects/:id/deadlines")
  list(@Param("id") projectId: string, @Req() req: any) { return this.deadlines.upcoming(projectId, req.userId); }
  @Post("checklist/:itemId/ack")
  async ack(@Param("itemId") itemId: string, @Req() req: any) { await this.deadlines.ack(itemId, req.userId); return { ok: true }; }
}
