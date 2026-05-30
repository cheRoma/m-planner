import { describe, it, expect, vi } from "vitest";
import { ShowcaseService } from "./showcase.service";

describe("ShowcaseService.cityShowcase", () => {
  it("reads aggregates via BenchmarkReader and caches the result", async () => {
    const reader = { getAggregates: vi.fn(async (_s: any, slugs: string[]) =>
      new Map(slugs.map((s) => [s, { categorySlug: s, source: "seed", p25: 1n, median: 2n, p75: 3n, sampleCount: 0, asOfYear: 2026 }]))) } as any;
    const cache = { getOrSet: vi.fn(async (_k: string, _t: number, fn: any) => fn()) } as any;
    const prisma = { category: { findMany: async () => [{ slug: "banquet", unit: "per_guest" }] } } as any;
    const svc = new ShowcaseService(reader, cache, prisma);
    const res = await svc.cityShowcase({ city: "msk", tier: "mid", format: "zags" });
    expect(res.items[0]?.categorySlug).toBe("banquet");
    expect(cache.getOrSet).toHaveBeenCalled();
    expect(reader.getAggregates).toHaveBeenCalledTimes(1); // batched, single read
  });
});
