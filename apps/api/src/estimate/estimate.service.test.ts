import { describe, it, expect } from "vitest";
import { EstimateService } from "./estimate.service";
import type { AggregateResult } from "./benchmark-reader";

// Fake reader returning fixed aggregates; categories carry their unit.
function makeService(aggs: Record<string, AggregateResult>, units: Record<string, "per_guest" | "fixed">) {
  const reader = {
    getAggregates: async (_s: any, slugs: string[]) => new Map(slugs.map((s) => [s, aggs[s]])),
  } as any;
  const prisma = {
    category: { findMany: async () => Object.entries(units).map(([slug, unit], i) => ({ slug, unit, name: slug, sort: i })) },
  } as any;
  return new EstimateService(reader, prisma);
}

describe("EstimateService.compute", () => {
  it("multiplies per_guest median by guests and keeps fixed as-is", async () => {
    const svc = makeService(
      {
        banquet: { categorySlug: "banquet", source: "crowd", p25: 400000n, median: 500000n, p75: 800000n, sampleCount: 7, asOfYear: null } as any,
        photo:   { categorySlug: "photo",   source: "seed",  p25: 6400000n, median: 8000000n, p75: 10400000n, sampleCount: 0, asOfYear: 2026 } as any,
      },
      { banquet: "per_guest", photo: "fixed" },
    );
    const res = await svc.compute({ city: "msk", format: "zags", tier: "mid", guests: 80 });
    const banquet = res.lines.find((l) => l.categorySlug === "banquet")!;
    expect(banquet.mid).toBe(String(500000n * 80n)); // 80 guests
    expect(banquet.label).toBe("По 7 реальным свадьбам");
    const photo = res.lines.find((l) => l.categorySlug === "photo")!;
    expect(photo.mid).toBe("8000000");
    expect(photo.label).toBe("Ориентир (2026)"); // §12.4 — seed never labeled "реальные"
  });

  it("skips categories with insufficient data", async () => {
    const svc = makeService(
      { banquet: { insufficient: true } },
      { banquet: "per_guest" },
    );
    const res = await svc.compute({ city: "msk", format: "zags", tier: "mid", guests: 50 });
    expect(res.lines).toHaveLength(0);
  });
});
