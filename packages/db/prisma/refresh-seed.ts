import { prisma } from "../src/index";

/**
 * §12.13: quarterly seed refresh. Market grows ~+20%/year; without this the
 * estimate hook lowballs within ~6 months. Run by a named owner; idempotent per
 * (factor, asOfYear) — re-running with the same asOfYear that already applied is a no-op.
 */
export async function refreshSeed(opts: { factor: number; asOfYear: number }): Promise<void> {
  const num = BigInt(Math.round(opts.factor * 10));
  const seedRows = await prisma.priceBenchmark.findMany({ where: { source: "seed" } });
  for (const r of seedRows) {
    if (r.asOfYear === opts.asOfYear) continue; // already at target year
    await prisma.priceBenchmark.update({
      where: { categoryId_city_tier_source: { categoryId: r.categoryId, city: r.city, tier: r.tier, source: "seed" } },
      data: { p25: (r.p25 * num) / 10n, median: (r.median * num) / 10n, p75: (r.p75 * num) / 10n, asOfYear: opts.asOfYear },
    });
  }
}

if (process.argv[1]?.endsWith("refresh-seed.ts")) {
  refreshSeed({ factor: 1.2, asOfYear: new Date().getUTCFullYear() }).then(() => prisma.$disconnect());
}
