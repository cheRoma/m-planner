import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { EstimateModule } from "./estimate/estimate.module";
import { ProjectModule } from "./project/project.module";
import { ShowcaseModule } from "./showcase/showcase.module";
import { MetricsModule } from "./metrics/metrics.module";

@Module({
  imports: [AuthModule, EstimateModule, ProjectModule, ShowcaseModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
