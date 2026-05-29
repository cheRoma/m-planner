"use client";
import { useState } from "react";
import { fetchEstimate } from "../lib/api";
import { formatRub, type Money } from "@m/shared";

export default function Home() {
  const [guests, setGuests] = useState(80);
  const [result, setResult] = useState<any>(null);
  const slice = { city: "msk", format: "zags", tier: "mid" };

  async function run() { setResult(await fetchEstimate({ ...slice, guests })); }
  const shareUrl = `${process.env.API_URL ?? ""}`.replace(/:3001$/, ":3000") +
    `/s/${slice.city}_${slice.format}_${slice.tier}_${guests}`;

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Смета свадьбы в Москве</h1>
      <label>Гостей: <input type="number" value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></label>
      <button onClick={run}>Посчитать</button>
      {result && (
        <>
          <h2>{formatRub(BigInt(result.totalMid) as Money)} (диапазон {formatRub(BigInt(result.totalLow) as Money)}–{formatRub(BigInt(result.totalHigh) as Money)})</h2>
          <ul>{result.lines.map((l: any) => (
            <li key={l.categorySlug}>{l.categorySlug}: {formatRub(BigInt(l.mid) as Money)} <small>({l.label})</small></li>
          ))}</ul>
          <a href={shareUrl}>Поделиться</a>
        </>
      )}
    </main>
  );
}
