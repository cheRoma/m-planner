import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { BenchmarkReader } from "./benchmark-reader";
import { EstimateService } from "./estimate.service";
import { EstimateController } from "./estimate.controller";

@Module({
  controllers: [EstimateController],
  providers: [
    BenchmarkReader,
    EstimateService,
    { provide: "PRISMA", useValue: prisma },
    // Clamp to a floor of 1: N_THRESHOLD=0 (or NaN) would defeat k-anon by letting
    // single-sample crowd rows through. Floor of 1 keeps the privacy boundary intact.
    { provide: "BENCHMARK_CONFIG", useValue: { threshold: Math.max(1, Number(process.env.N_THRESHOLD) || 5) } },
  ],
  exports: [BenchmarkReader, EstimateService],
})
export class EstimateModule {}
