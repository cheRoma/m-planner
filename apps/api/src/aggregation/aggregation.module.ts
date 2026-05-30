import { Module, OnModuleInit, OnModuleDestroy, Inject } from "@nestjs/common";
import { prisma } from "@m/db";
import { CrowdAggregator } from "./crowd-aggregator";
import { makeAggregationQueue, makeAggregationWorker } from "./aggregation.queue";
import type { Queue, Worker } from "bullmq";
import type { SliceKey } from "./crowd-aggregator";

@Module({
  providers: [
    CrowdAggregator,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AGG_QUEUE", useFactory: () => makeAggregationQueue(process.env.REDIS_URL ?? "redis://localhost:6379") },
  ],
  exports: ["AGG_QUEUE"],
})
export class AggregationModule implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<SliceKey>;
  constructor(private readonly aggregator: CrowdAggregator, @Inject("AGG_QUEUE") private readonly queue: Queue<SliceKey>) {}
  onModuleInit() {
    this.worker = makeAggregationWorker(process.env.REDIS_URL ?? "redis://localhost:6379", (key) => this.aggregator.recomputeSlice(key));
  }
  async onModuleDestroy() { await this.worker?.close(); await this.queue.close(); }
}
