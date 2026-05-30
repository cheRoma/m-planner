import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { winsorize, percentiles } from "./winsorize";

export interface SliceKey { categorySlug: string; city: string; tier: string; format: string; }

@Injectable()
export class CrowdAggregator {
  constructor(@Inject("PRISMA") private readonly prisma: PrismaClient) {}

  async recomputeSlice(key: SliceKey): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { slug: key.categorySlug } });
    if (!category) return;
    const facts = await this.prisma.spendFact.findMany({
      where: { categoryId: category.id, city: key.city, tier: key.tier, format: key.format },
      select: { amount: true },
    });
    const cleaned = winsorize(facts.map((f) => f.amount), 0.05);
    const { p25, median, p75 } = percentiles(cleaned);
    await this.prisma.priceBenchmark.upsert({
      where: { categoryId_city_tier_source: { categoryId: category.id, city: key.city, tier: key.tier, source: "crowd" } },
      update: { p25, median, p75, sampleCount: cleaned.length, asOfYear: null },
      create: { categoryId: category.id, city: key.city, tier: key.tier, source: "crowd", p25, median, p75, sampleCount: cleaned.length, asOfYear: null },
    });
  }
}
