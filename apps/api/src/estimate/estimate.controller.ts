import { Body, Controller, Post, UseGuards, BadRequestException } from "@nestjs/common";
import { EstimateRequestSchema } from "@m/shared";
import { EstimateService } from "./estimate.service";
import { RateLimitGuard } from "../ratelimit/rate-limit.guard";
import { MetricsService } from "../metrics/metrics.service";

@Controller("estimate")
@UseGuards(RateLimitGuard)
export class EstimateController {
  constructor(
    private readonly estimate: EstimateService,
    private readonly metrics: MetricsService,
  ) {}

  @Post()
  async compute(@Body() body: unknown) {
    const parsed = EstimateRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.estimate.compute(parsed.data);
    this.metrics.inc("estimate_computed");
    return result;
  }
}
