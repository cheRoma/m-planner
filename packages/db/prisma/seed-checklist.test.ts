import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/index";
import { seedChecklist } from "./seed-checklist";

describe("seedChecklist", () => {
  beforeAll(async () => { await seedChecklist(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("seeds zags templates with source_url and review_date per city", async () => {
    const zags = await prisma.checklistTemplate.findMany({ where: { kind: "zags" } });
    expect(zags.length).toBeGreaterThan(0);
    for (const t of zags) {
      expect(t.sourceUrl).toBeTruthy();   // §12.12 — compliance content cites a source
      expect(t.reviewDate).not.toBeNull();
      expect(t.city).toBeTruthy();        // per-city variation (МСК/СПб)
    }
  });

  it("seeds general vendor-booking templates with offsets", async () => {
    const photo = await prisma.checklistTemplate.findUnique({ where: { key: "book_photo" } });
    expect(photo?.offsetDaysBeforeWedding).toBeGreaterThanOrEqual(150); // ~6 months
  });
});
