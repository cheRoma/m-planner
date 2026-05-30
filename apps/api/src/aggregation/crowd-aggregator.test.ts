import { describe, it, expect, vi } from "vitest";
import { CrowdAggregator } from "./crowd-aggregator";

function fakePrisma(facts: any[]) {
  return {
    spendFact: { findMany: vi.fn(async () => facts) },
    category: { findFirst: vi.fn(async () => ({ id: "c1" })) },
    priceBenchmark: { upsert: vi.fn(async () => ({})) },
  } as any;
}

describe("CrowdAggregator.recomputeSlice", () => {
  it("writes a crowd benchmark with winsorized percentiles and sampleCount", async () => {
    const facts = Array.from({ length: 6 }, (_, i) => ({ amount: BigInt((i + 1) * 100000), categoryId: "c1" }));
    const prisma = fakePrisma(facts);
    const agg = new CrowdAggregator(prisma);
    await agg.recomputeSlice({ categorySlug: "banquet", city: "msk", tier: "mid", format: "zags" });
    expect(prisma.priceBenchmark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId_city_tier_source: { categoryId: "c1", city: "msk", tier: "mid", source: "crowd" } },
        create: expect.objectContaining({ source: "crowd", sampleCount: 6 }),
      }),
    );
  });
});
