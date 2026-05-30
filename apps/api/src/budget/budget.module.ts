import { Module, OnModuleDestroy, Inject } from "@nestjs/common";
import { prisma } from "@m/db";
import type { Queue } from "bullmq";
import type { SliceKey } from "../aggregation/crowd-aggregator";
import { makeAggregationQueue } from "../aggregation/aggregation.queue";
import { BudgetService } from "./budget.service";
import { PaymentService } from "./payment.service";
import { BudgetController } from "./budget.controller";
import { SpendFactService } from "../spend/spend-fact.service";

@Module({
  controllers: [BudgetController],
  providers: [
    BudgetService, PaymentService, SpendFactService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
    // Queue-only (no Worker). The crowd-recompute Worker lives in AggregationModule;
    // importing that module here would start a live BullMQ Worker → open Redis handle
    // in every e2e bootstrap (hangs the vitest suite). We only need to enqueue, then
    // release the handle on shutdown (see onModuleDestroy below).
    { provide: "AGG_QUEUE", useFactory: () => makeAggregationQueue(process.env.REDIS_URL ?? "redis://localhost:6379") },
  ],
})
export class BudgetModule implements OnModuleDestroy {
  constructor(@Inject("AGG_QUEUE") private readonly queue: Queue<SliceKey>) {}
  // Close the Redis connection so app.close() (e2e) exits cleanly — no hung handle.
  async onModuleDestroy() { await this.queue.close(); }
}
