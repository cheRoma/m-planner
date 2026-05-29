import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { ProjectService } from "./project.service";

const CreateProjectSchema = z.object({
  city: z.string(), format: z.string(), tier: z.string(),
  guests: z.number().int().min(1), weddingDate: z.string(),
  lines: z.array(z.object({ categorySlug: z.string(), plannedAmount: z.string() })),
});

@Controller("projects")
@UseGuards(JwtGuard)
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}

  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const input = CreateProjectSchema.parse(body);
    return this.projects.createFromEstimate(req.userId, input);
  }
}
