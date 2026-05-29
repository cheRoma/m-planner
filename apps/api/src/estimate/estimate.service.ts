import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { EstimateRequest, EstimateResult, EstimateLine, Money } from "@m/shared";
import { mulMoney } from "@m/shared";
import { BenchmarkReader, type Aggregate } from "./benchmark-reader";

@Injectable()
export class EstimateService {
  constructor(
    private readonly reader: BenchmarkReader,
    @Inject("PRISMA") private readonly prisma: PrismaClient,
  ) {}

  async compute(req: EstimateRequest): Promise<EstimateResult> {
    const categories = await this.prisma.category.findMany({ orderBy: { sort: "asc" } });
    const slugs = categories.map((c) => c.slug);
    const unitBySlug = new Map(categories.map((c) => [c.slug, c.unit as "per_guest" | "fixed"]));

    const aggs = await this.reader.getAggregates(
      { city: req.city, tier: req.tier, format: req.format }, slugs,
    );

    const lines: EstimateLine[] = [];
    let totalLow = 0n, totalMid = 0n, totalHigh = 0n;

    for (const slug of slugs) {
      const a = aggs.get(slug);
      if (!a || "insufficient" in a) continue;
      const unit = unitBySlug.get(slug)!;
      const scale = (m: Money): Money => (unit === "per_guest" ? mulMoney(m, req.guests) : m);
      const low = scale(a.p25), mid = scale(a.median), high = scale(a.p75);
      totalLow += low; totalMid += mid; totalHigh += high;
      lines.push({
        categorySlug: slug,
        source: a.source,
        label: this.label(a),
        low: low.toString(), mid: mid.toString(), high: high.toString(),
      });
    }

    return {
      lines,
      totalLow: totalLow.toString(), totalMid: totalMid.toString(), totalHigh: totalHigh.toString(),
    };
  }

  // §12.4: "реальные" only for crowd; seed → "Ориентир (YYYY)".
  private label(a: Aggregate): string {
    return a.source === "crowd"
      ? `По ${a.sampleCount} реальным свадьбам`
      : `Ориентир (${a.asOfYear ?? "—"})`;
  }
}
