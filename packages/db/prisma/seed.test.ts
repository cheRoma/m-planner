import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/index";
import { seed } from "./seed";

describe("seed", () => {
  beforeAll(async () => { await seed(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("creates categories with units", async () => {
    const cats = await prisma.category.findMany();
    expect(cats.length).toBeGreaterThanOrEqual(6);
    expect(cats.find((c) => c.slug === "banquet")?.unit).toBe("per_guest");
  });

  it("creates seed benchmarks for msk×mid with as_of_year set", async () => {
    const b = await prisma.priceBenchmark.findFirst({
      where: { city: "msk", tier: "mid", source: "seed", category: { slug: "banquet" } },
    });
    expect(b).not.toBeNull();
    expect(b!.asOfYear).toBe(2026);
    expect(b!.median).toBeGreaterThan(0n);
  });
});
