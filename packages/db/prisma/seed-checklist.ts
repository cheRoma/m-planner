import { prisma } from "../src/index";

// §12.12: ЗАГС templates are compliance content — each cites a source and a review date,
// and varies by city. VERIFY against the live regulator before launch (named owner).
const REVIEW = new Date("2026-05-29");

const TEMPLATES = [
  // ЗАГС (per city) — sourceUrl must point to the regional ЗАГС/Госуслуги rule.
  { key: "zags_application_msk", title: "Подать заявление в ЗАГС (Москва)", kind: "zags", offsetDaysBeforeWedding: 35, city: "msk", sourceUrl: "https://www.mos.ru/services/", reviewDate: REVIEW },
  { key: "zags_docs_msk", title: "Собрать документы для ЗАГС (паспорта, оплата госпошлины)", kind: "zags", offsetDaysBeforeWedding: 40, city: "msk", sourceUrl: "https://www.mos.ru/services/", reviewDate: REVIEW },
  { key: "zags_application_spb", title: "Подать заявление в ЗАГС (Санкт-Петербург)", kind: "zags", offsetDaysBeforeWedding: 35, city: "spb", sourceUrl: "https://gu.spb.ru/", reviewDate: REVIEW },
  { key: "zags_docs_spb", title: "Собрать документы для ЗАГС (паспорта, оплата госпошлины)", kind: "zags", offsetDaysBeforeWedding: 40, city: "spb", sourceUrl: "https://gu.spb.ru/", reviewDate: REVIEW },
  // Vendor booking (city-agnostic)
  { key: "book_photo", title: "Забронировать фотографа", kind: "vendor", offsetDaysBeforeWedding: 180, city: null, sourceUrl: null, reviewDate: null },
  { key: "book_host", title: "Забронировать ведущего", kind: "vendor", offsetDaysBeforeWedding: 180, city: null, sourceUrl: null, reviewDate: null },
  { key: "buy_dress", title: "Выбрать и заказать платье", kind: "vendor", offsetDaysBeforeWedding: 90, city: null, sourceUrl: null, reviewDate: null },
  // General
  { key: "guest_list", title: "Составить список гостей", kind: "general", offsetDaysBeforeWedding: 120, city: null, sourceUrl: null, reviewDate: null },
] as const;

export async function seedChecklist() {
  for (const t of TEMPLATES) {
    await prisma.checklistTemplate.upsert({
      where: { key: t.key },
      update: { title: t.title, kind: t.kind, offsetDaysBeforeWedding: t.offsetDaysBeforeWedding, city: t.city, sourceUrl: t.sourceUrl, reviewDate: t.reviewDate },
      create: { key: t.key, title: t.title, kind: t.kind, offsetDaysBeforeWedding: t.offsetDaysBeforeWedding, city: t.city, sourceUrl: t.sourceUrl, reviewDate: t.reviewDate },
    });
  }
}

if (process.argv[1]?.endsWith("seed-checklist.ts")) {
  seedChecklist().then(() => prisma.$disconnect()).then(() => console.log("checklist seeded"));
}
