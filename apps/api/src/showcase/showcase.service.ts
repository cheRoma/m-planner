import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { BenchmarkReader, type Slice } from "../estimate/benchmark-reader";
import { RedisCache } from "../cache/redis-cache";

export interface ShowcaseItem { categorySlug: string; source: "seed" | "crowd"; median: string; p25: string; p75: string; sampleCount: number; }
export interface ShowcaseResult { items: ShowcaseItem[]; }

@Injectable()
export class ShowcaseService {
  constructor(
    private readonly reader: BenchmarkReader,
    private readonly cache: RedisCache,
    @Inject("PRISMA") private readonly prisma: PrismaClient,
  ) {}

  async cityShowcase(slice: Slice): Promise<ShowcaseResult> {
    const key = `showcase:${slice.city}:${slice.tier}:${slice.format}`;
    return this.cache.getOrSet(key, 600, async () => {
      const categories = await this.prisma.category.findMany({ orderBy: { sort: "asc" } });
      const aggs = await this.reader.getAggregates(slice, categories.map((c) => c.slug));
      const items: ShowcaseItem[] = [];
      for (const c of categories) {
        const a = aggs.get(c.slug);
        if (!a || "insufficient" in a) continue;
        items.push({ categorySlug: c.slug, source: a.source, median: a.median.toString(), p25: a.p25.toString(), p75: a.p75.toString(), sampleCount: a.sampleCount });
      }
      return { items };
    });
  }
}
