import { fetchShowcase, kopecks } from "../../lib/api";
import { formatRub } from "@m/shared";

export const dynamic = "force-dynamic"; // SSR; кэш — на стороне API (Cache-Control)

export default async function ShowcasePage() {
  let items: any[] = [];
  try {
    const data = await fetchShowcase({ city: "msk", tier: "mid", format: "zags" });
    items = Array.isArray(data?.items) ? data.items : [];
  } catch {
    // API down/erroring — degrade to an empty state instead of 500
    // so the indexable witrina stays crawlable.
    items = [];
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Сметы свадеб в Москве</h1>
      {items.length === 0 ? (
        <p>Данные обновляются</p>
      ) : (
        <ul>
          {items.map((it: any) => (
            <li key={it.categorySlug}>
              {it.categorySlug}: {formatRub(kopecks(it.median))}{" "}
              <small>{it.source === "crowd" ? `по ${it.sampleCount} реальным свадьбам` : "ориентир (2026)"}</small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
