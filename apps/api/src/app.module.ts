import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { EstimateModule } from "./estimate/estimate.module";
import { ProjectModule } from "./project/project.module";

@Module({ imports: [AuthModule, EstimateModule, ProjectModule], controllers: [HealthController] })
export class AppModule {}
