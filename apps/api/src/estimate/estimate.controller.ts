import { Body, Controller, Post, BadRequestException } from "@nestjs/common";
import { EstimateRequestSchema } from "@m/shared";
import { EstimateService } from "./estimate.service";

@Controller("estimate")
export class EstimateController {
  constructor(private readonly estimate: EstimateService) {}

  @Post()
  async compute(@Body() body: unknown) {
    const parsed = EstimateRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.estimate.compute(parsed.data);
  }
}
