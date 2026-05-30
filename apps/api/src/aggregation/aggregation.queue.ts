import { Queue, Worker } from "bullmq";
import type { SliceKey } from "./crowd-aggregator";

export const AGG_QUEUE = "crowd-aggregation";

export function makeAggregationQueue(connectionUrl: string): Queue<SliceKey> {
  const url = new URL(connectionUrl);
  return new Queue<SliceKey>(AGG_QUEUE, { connection: { host: url.hostname, port: Number(url.port || 6379) } });
}

export function makeAggregationWorker(connectionUrl: string, handler: (key: SliceKey) => Promise<void>): Worker<SliceKey> {
  const url = new URL(connectionUrl);
  return new Worker<SliceKey>(AGG_QUEUE, async (job) => handler(job.data), {
    connection: { host: url.hostname, port: Number(url.port || 6379) },
  });
}
