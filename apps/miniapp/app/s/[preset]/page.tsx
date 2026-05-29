import type { Metadata } from "next";
import { fetchEstimate, kopecks } from "../../../lib/api";
import { formatRub } from "@m/shared";

// preset формат: city_format_tier_guests, напр. "msk_zags_mid_80"
function parsePreset(preset: string) {
  // noUncheckedIndexedAccess makes destructured parts `string | undefined`;
  // fall back to "" so downstream typing stays `string`.
  const [city = "", format = "", tier = "", guests = ""] = preset.split("_");
  return { city, format, tier, guests: Number(guests) };
}

const STATIC_TITLE = "Смета свадьбы в Москве";

export async function generateMetadata({ params }: { params: { preset: string } }): Promise<Metadata> {
  const p = parsePreset(params.preset);
  let title = STATIC_TITLE;
  try {
    const est = await fetchEstimate(p);
    // API down/erroring must never 500 the share card — fall back to static title.
    title = `Смета свадьбы в Москве: ~${formatRub(kopecks(est.totalMid))}`;
  } catch {
    title = STATIC_TITLE;
  }
  return {
    title,
    openGraph: { title, description: `Рассчитай свою смету в Telegram`, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function PresetLanding({ params }: { params: { preset: string } }) {
  const p = parsePreset(params.preset);
  const botUrl = `https://t.me/${process.env.BOT_USERNAME ?? "mplanner_bot"}?startapp=preset_${params.preset}`;

  let total: string | null = null;
  try {
    const est = await fetchEstimate(p);
    total = formatRub(kopecks(est.totalMid));
  } catch {
    // API momentarily down — render a still-useful page without the number.
    // The "Открыть в Telegram" CTA must always render so shared links convert.
    total = null;
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>{total ? `Смета свадьбы в Москве: ~${total}` : STATIC_TITLE}</h1>
      <p>{p.guests} гостей · {p.format}</p>
      <a href={botUrl}>Открыть в Telegram</a>
    </main>
  );
}
