import { Module, Inject, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { prisma } from "@m/db";
import { BenchmarkReader } from "../estimate/benchmark-reader";
import { RedisCache } from "../cache/redis-cache";
import { RateLimitGuard } from "../ratelimit/rate-limit.guard";
import { ShowcaseService } from "./showcase.service";
import { ShowcaseController } from "./showcase.controller";

@Module({
  controllers: [ShowcaseController],
  providers: [
    BenchmarkReader, RedisCache, ShowcaseService, RateLimitGuard,
    { provide: "PRISMA", useValue: prisma },
    { provide: "BENCHMARK_CONFIG", useValue: { threshold: Math.max(1, Number(process.env.N_THRESHOLD) || 5) } },
    // Shared Redis client: backs both RedisCache (showcase cache) and RateLimitGuard.
    { provide: "REDIS", useFactory: () => new Redis(process.env.REDIS_URL ?? "redis://localhost:6379") },
    { provide: "RATELIMIT_CONFIG", useValue: { limit: 30, windowSec: 60 } },
  ],
})
export class ShowcaseModule implements OnModuleDestroy {
  // A useFactory Redis client is NOT auto-closed by Nest; quit it on shutdown so
  // the vitest e2e suite releases the socket handle and exits cleanly.
  constructor(@Inject("REDIS") private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> { await this.redis.quit(); }
}
