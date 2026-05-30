/** Drop non-positive values, then clamp the lowest/highest `frac` to the percentile bounds. */
export function winsorize(values: bigint[], frac: number): bigint[] {
  const clean = values.filter((v) => v > 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (clean.length === 0) return [];
  const loIdx = Math.floor((clean.length - 1) * frac);
  const hiIdx = Math.floor((clean.length - 1) * (1 - frac));
  const lo = clean[Math.min(loIdx, clean.length - 1)]!;
  const hi = clean[Math.max(hiIdx, 0)]!;
  return clean.map((v) => (v < lo ? lo : v > hi ? hi : v));
}

function quantile(sorted: bigint[], q: number): bigint {
  if (sorted.length === 0) return 0n;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[idx]!;
}

export function percentiles(values: bigint[]): { p25: bigint; median: bigint; p75: bigint } {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { p25: quantile(sorted, 0.25), median: quantile(sorted, 0.5), p75: quantile(sorted, 0.75) };
}
