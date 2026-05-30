import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { EstimateModule } from "./estimate/estimate.module";
import { ProjectModule } from "./project/project.module";
import { ShowcaseModule } from "./showcase/showcase.module";
import { MetricsModule } from "./metrics/metrics.module";
import { BudgetModule } from "./budget/budget.module";
import { InviteModule } from "./invite/invite.module";
import { ChecklistModule } from "./checklist/checklist.module";
import { ConsentModule } from "./consent/consent.module";
import { DeletionModule } from "./gdpr/deletion.module";

@Module({
  imports: [AuthModule, EstimateModule, ProjectModule, ShowcaseModule, MetricsModule, BudgetModule, InviteModule, ChecklistModule, ConsentModule, DeletionModule],
  controllers: [HealthController],
})
export class AppModule {}
