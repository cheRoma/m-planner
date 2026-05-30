import type { WeddingFormat, City } from "@m/shared";

// §11.3: kamernaya removes тамада/выкуп/большой банкет-heavy items.
const KAMERNAYA_DROP = new Set(["host", "music"]);

export function categoriesForFormat(format: WeddingFormat, allSlugs: string[]): string[] {
  if (format === "kamernaya") return allSlugs.filter((s) => !KAMERNAYA_DROP.has(s));
  return allSlugs;
}

export function checklistKeysForFormat(format: WeddingFormat, city: City): string[] {
  const zags = city === "spb" ? ["zags_application_spb", "zags_docs_spb"] : ["zags_application_msk", "zags_docs_msk"];
  const base = [...zags, "buy_dress", "book_photo", "guest_list"];
  if (format === "kamernaya") return base; // no host
  return [...base, "book_host"];
}
