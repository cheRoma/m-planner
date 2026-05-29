import { prisma } from "../src/index";
import { rub } from "@m/shared";

// Seed price grid: median ₽ per category × tier (МСК base). СПб ≈ 0.85× МСК.
// Sources: audience-research.docx / market-sizing.md (ориентир 2026).
const CATEGORIES = [
  { slug: "banquet", name: "Банкет", unit: "per_guest", sort: 1, msk: { budget: 3500, mid: 5000, premium: 8000 } },
  { slug: "venue", name: "Площадка", unit: "fixed", sort: 2, msk: { budget: 80000, mid: 200000, premium: 500000 } },
  { slug: "photo", name: "Фотограф", unit: "fixed", sort: 3, msk: { budget: 40000, mid: 80000, premium: 150000 } },
  { slug: "host", name: "Ведущий", unit: "fixed", sort: 4, msk: { budget: 35000, mid: 70000, premium: 130000 } },
  { slug: "decor", name: "Декор", unit: "fixed", sort: 5, msk: { budget: 50000, mid: 150000, premium: 400000 } },
  { slug: "dress", name: "Платье", unit: "fixed", sort: 6, msk: { budget: 30000, mid: 80000, premium: 200000 } },
  { slug: "music", name: "Музыка/DJ", unit: "fixed", sort: 7, msk: { budget: 30000, mid: 60000, premium: 120000 } },
] as const;

const SPB_FACTOR = 0.85;
const TIERS = ["budget", "mid", "premium"] as const;
const CITIES: Record<"msk" | "spb", number> = { msk: 1, spb: SPB_FACTOR };

export async function seed() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, unit: c.unit, sort: c.sort },
      create: { slug: c.slug, name: c.name, unit: c.unit, sort: c.sort },
    });
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: c.slug } });
    for (const [city, factor] of Object.entries(CITIES) as ["msk" | "spb", number][]) {
      for (const tier of TIERS) {
        const med = c.msk[tier] * factor;
        await prisma.priceBenchmark.upsert({
          where: { categoryId_city_tier_source: { categoryId: cat.id, city, tier, source: "seed" } },
          update: { p25: rub(med * 0.8), median: rub(med), p75: rub(med * 1.3), sampleCount: 0, asOfYear: 2026 },
          create: {
            categoryId: cat.id, city, tier, source: "seed",
            p25: rub(med * 0.8), median: rub(med), p75: rub(med * 1.3), sampleCount: 0, asOfYear: 2026,
          },
        });
      }
    }
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().then(() => prisma.$disconnect()).then(() => console.log("seeded"));
}
