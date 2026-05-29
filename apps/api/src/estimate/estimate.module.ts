import { Module, Inject, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { prisma } from "@m/db";
import { BenchmarkReader } from "./benchmark-reader";
import { EstimateService } from "./estimate.service";
import { EstimateController } from "./estimate.controller";
import { RateLimitGuard } from "../ratelimit/rate-limit.guard";

@Module({
  controllers: [EstimateController],
  providers: [
    BenchmarkReader,
    EstimateService,
    RateLimitGuard,
    { provide: "PRISMA", useValue: prisma },
    // Clamp to a floor of 1: N_THRESHOLD=0 (or NaN) would defeat k-anon by letting
    // single-sample crowd rows through. Floor of 1 keeps the privacy boundary intact.
    { provide: "BENCHMARK_CONFIG", useValue: { threshold: Math.max(1, Number(process.env.N_THRESHOLD) || 5) } },
    // Redis-backed fixed-window rate limit for the anonymous /estimate endpoint.
    { provide: "REDIS", useFactory: () => new Redis(process.env.REDIS_URL ?? "redis://localhost:6379") },
    { provide: "RATELIMIT_CONFIG", useValue: { limit: 30, windowSec: 60 } },
  ],
  exports: [BenchmarkReader, EstimateService],
})
export class EstimateModule implements OnModuleDestroy {
  // useFactory Redis client is not auto-closed; quit on shutdown so vitest exits cleanly.
  constructor(@Inject("REDIS") private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> { await this.redis.quit(); }
}
