import { Body, Controller, Post, Req, UseGuards, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { JwtGuard } from "../auth/jwt.guard";
import { ConsentGuard } from "../consent/consent.guard";
import { ProjectService } from "./project.service";
import { MetricsService } from "../metrics/metrics.service";

const CreateProjectSchema = z.object({
  city: z.string(), format: z.string(), tier: z.string(),
  guests: z.number().int().min(1), weddingDate: z.string(),
  lines: z.array(z.object({ categorySlug: z.string(), plannedAmount: z.string() })),
});

@Controller("projects")
@UseGuards(JwtGuard, ConsentGuard)
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly metrics: MetricsService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.projects.createFromEstimate(req.userId, parsed.data);
    this.metrics.inc("project_saved");
    return result;
  }
}
