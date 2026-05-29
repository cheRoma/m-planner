import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { City, Tier, WeddingFormat, Money } from "@m/shared";

export interface Slice { city: City; tier: Tier; format: WeddingFormat; }

export interface Aggregate {
  categorySlug: string;
  source: "seed" | "crowd";
  p25: Money; median: Money; p75: Money;
  sampleCount: number;
  asOfYear: number | null;
}
export type AggregateResult = Aggregate | { insufficient: true };

/**
 * The ONLY door to price aggregates. Enforces the k-anon threshold for every read
 * (estimate, /showcase, OG landing). Raw price_benchmarks never leaves this class.
 * Batched: one findMany for all categories in a slice (no N+1).
 */
@Injectable()
export class BenchmarkReader {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("BENCHMARK_CONFIG") private readonly config: { threshold: number },
  ) {}

  async getAggregates(slice: Slice, categorySlugs: string[]): Promise<Map<string, AggregateResult>> {
    const rows = await this.prisma.priceBenchmark.findMany({
      where: { city: slice.city, tier: slice.tier, category: { slug: { in: categorySlugs } } },
      include: { category: { select: { slug: true } } },
    });

    const bySlug = new Map<string, { crowd?: typeof rows[number]; seed?: typeof rows[number] }>();
    for (const r of rows) {
      const slug = (r as any).category.slug as string;
      const e = bySlug.get(slug) ?? {};
      if (r.source === "crowd") e.crowd = r; else if (r.source === "seed") e.seed = r;
      bySlug.set(slug, e);
    }

    const out = new Map<string, AggregateResult>();
    for (const slug of categorySlugs) {
      const e = bySlug.get(slug);
      const crowd = e?.crowd;
      if (crowd && crowd.sampleCount >= this.config.threshold) {
        out.set(slug, this.toAggregate(slug, crowd));
      } else if (e?.seed) {
        out.set(slug, this.toAggregate(slug, e.seed));
      } else {
        out.set(slug, { insufficient: true });
      }
    }
    return out;
  }

  private toAggregate(slug: string, r: { source: string; p25: bigint; median: bigint; p75: bigint; sampleCount: number; asOfYear: number | null }): Aggregate {
    return {
      categorySlug: slug,
      source: r.source as "seed" | "crowd",
      p25: r.p25 as Money, median: r.median as Money, p75: r.p75 as Money,
      sampleCount: r.sampleCount, asOfYear: r.asOfYear,
    };
  }
}
