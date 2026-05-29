import type { Metadata } from "next";
import { fetchEstimate } from "../../../lib/api";
import { formatRub, type Money } from "@m/shared";

// preset формат: city_format_tier_guests, напр. "msk_zags_mid_80"
function parsePreset(preset: string) {
  // noUncheckedIndexedAccess makes destructured parts `string | undefined`;
  // fall back to "" so downstream typing stays `string`.
  const [city = "", format = "", tier = "", guests = ""] = preset.split("_");
  return { city, format, tier, guests: Number(guests) };
}

export async function generateMetadata({ params }: { params: { preset: string } }): Promise<Metadata> {
  const p = parsePreset(params.preset);
  const est = await fetchEstimate(p);
  const total = formatRub(BigInt(est.totalMid) as Money);
  const title = `Смета свадьбы в Москве: ~${total}`;
  return {
    title,
    openGraph: { title, description: `Рассчитай свою смету в Telegram`, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function PresetLanding({ params }: { params: { preset: string } }) {
  const p = parsePreset(params.preset);
  const est = await fetchEstimate(p);
  const botUrl = `https://t.me/${process.env.BOT_USERNAME ?? "mplanner_bot"}?startapp=preset_${params.preset}`;
  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Смета свадьбы в Москве: ~{formatRub(BigInt(est.totalMid) as Money)}</h1>
      <p>{p.guests} гостей · {p.format}</p>
      <a href={botUrl}>Открыть в Telegram</a>
    </main>
  );
}
