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
    { provide: "BENCHMARK_CONFIG", useValue: { threshold: Number(process.env.N_THRESHOLD ?? 5) } },
  ],
  exports: [BenchmarkReader, EstimateService],
})
export class EstimateModule {}
