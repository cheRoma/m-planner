import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { EstimateModule } from "./estimate/estimate.module";

@Module({ imports: [AuthModule, EstimateModule], controllers: [HealthController] })
export class AppModule {}
