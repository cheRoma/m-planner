import { Controller, Get, Query, Header, UseGuards, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { CITIES, TIERS, FORMATS } from "@m/shared";
import { ShowcaseService } from "./showcase.service";
import { RateLimitGuard } from "../ratelimit/rate-limit.guard";
import { MetricsService } from "../metrics/metrics.service";

const SliceQuery = z.object({ city: z.enum(CITIES), tier: z.enum(TIERS), format: z.enum(FORMATS) });

@Controller("public")
@UseGuards(RateLimitGuard)
export class ShowcaseController {
  constructor(
    private readonly showcase: ShowcaseService,
    private readonly metrics: MetricsService,
  ) {}

  @Get("showcase")
  @Header("Cache-Control", "public, s-maxage=600, stale-while-revalidate=60")
  async show(@Query() q: unknown) {
    const parsed = SliceQuery.safeParse(q);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.showcase.cityShowcase(parsed.data);
    this.metrics.inc("showcase_viewed");
    return result;
  }
}
