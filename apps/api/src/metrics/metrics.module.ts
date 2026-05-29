import { Global, Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

// Global so MetricsService is a singleton injectable across every feature module
// without re-providing it. Counters are incremented at the controller level
// (controllers are not unit-tested) to avoid churning service-constructor tests.
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
