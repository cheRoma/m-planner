import { Controller, Delete, Param, Req, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/jwt.guard";
import { DeletionService } from "./deletion.service";

@Controller("projects")
@UseGuards(JwtGuard)
export class DeletionController {
  constructor(private readonly deletion: DeletionService) {}

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    await this.deletion.deleteProject(id, req.userId);
    return { ok: true };
  }
}
