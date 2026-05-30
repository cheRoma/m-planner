import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/index";
import { seed } from "./seed";
import { refreshSeed } from "./refresh-seed";

describe("refreshSeed", () => {
  beforeAll(async () => { await seed(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("bumps seed medians by the inflation factor and updates as_of_year", async () => {
    // Pin one exact (city, tier) row: "banquet" has 6 seed rows (msk+spb × 3 tiers),
    // so findFirst without a key is non-deterministic and would compare different rows
    // across reruns against the live DB. Use the unique key for a stable before/after.
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: "banquet" } });
    const key = { categoryId_city_tier_source: { categoryId: cat.id, city: "msk", tier: "mid", source: "seed" } };
    const before = await prisma.priceBenchmark.findUniqueOrThrow({ where: key });
    await refreshSeed({ factor: 1.2, asOfYear: 2027 });
    const after = await prisma.priceBenchmark.findUniqueOrThrow({ where: key });
    expect(after.median).toBe((before.median * 12n) / 10n);
    expect(after.asOfYear).toBe(2027);
  });
});
