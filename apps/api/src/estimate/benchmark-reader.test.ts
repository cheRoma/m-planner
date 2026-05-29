import { describe, it, expect, vi } from "vitest";
import { BenchmarkReader, type Slice } from "./benchmark-reader";

// In-memory fake of the prisma.priceBenchmark.findMany call.
function fakePrisma(rows: any[]) {
  return { priceBenchmark: { findMany: vi.fn().mockResolvedValue(rows) } } as any;
}
const slice: Slice = { city: "msk", tier: "mid", format: "zags" };

describe("BenchmarkReader.getAggregates", () => {
  it("returns crowd when sampleCount >= threshold", async () => {
    const reader = new BenchmarkReader(
      fakePrisma([
        { categoryId: "c1", source: "crowd", p25: 10n, median: 20n, p75: 30n, sampleCount: 7, asOfYear: null, category: { slug: "banquet" } },
        { categoryId: "c1", source: "seed", p25: 5n, median: 15n, p75: 25n, sampleCount: 0, asOfYear: 2026, category: { slug: "banquet" } },
      ]),
      { threshold: 5 },
    );
    const res = await reader.getAggregates(slice, ["banquet"]);
    expect(res.get("banquet")?.source).toBe("crowd");
    expect(res.get("banquet")?.median).toBe(20n);
  });

  it("falls back to seed when crowd sampleCount < threshold", async () => {
    const reader = new BenchmarkReader(
      fakePrisma([
        { categoryId: "c1", source: "crowd", p25: 10n, median: 20n, p75: 30n, sampleCount: 2, asOfYear: null, category: { slug: "banquet" } },
        { categoryId: "c1", source: "seed", p25: 5n, median: 15n, p75: 25n, sampleCount: 0, asOfYear: 2026, category: { slug: "banquet" } },
      ]),
      { threshold: 5 },
    );
    const res = await reader.getAggregates(slice, ["banquet"]);
    expect(res.get("banquet")?.source).toBe("seed");
    expect(res.get("banquet")?.median).toBe(15n);
  });

  it("returns insufficient when neither crowd>=threshold nor seed exists", async () => {
    const reader = new BenchmarkReader(fakePrisma([]), { threshold: 5 });
    const res = await reader.getAggregates(slice, ["banquet"]);
    expect(res.get("banquet")).toEqual({ insufficient: true });
  });

  it("issues ONE query for all categories (no N+1)", async () => {
    const prisma = fakePrisma([]);
    const reader = new BenchmarkReader(prisma, { threshold: 5 });
    await reader.getAggregates(slice, ["banquet", "venue", "photo"]);
    expect(prisma.priceBenchmark.findMany).toHaveBeenCalledTimes(1);
  });
});
