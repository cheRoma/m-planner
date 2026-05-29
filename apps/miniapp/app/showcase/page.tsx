import { fetchShowcase } from "../../lib/api";
import { formatRub, type Money } from "@m/shared";

export const dynamic = "force-dynamic"; // SSR; кэш — на стороне API (Cache-Control)

export default async function ShowcasePage() {
  const data = await fetchShowcase({ city: "msk", tier: "mid", format: "zags" });
  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Сметы свадеб в Москве</h1>
      <ul>
        {data.items.map((it: any) => (
          <li key={it.categorySlug}>
            {it.categorySlug}: {formatRub(BigInt(it.median) as Money)}{" "}
            <small>{it.source === "crowd" ? `по ${it.sampleCount} реальным свадьбам` : "ориентир (2026)"}</small>
          </li>
        ))}
      </ul>
    </main>
  );
}
