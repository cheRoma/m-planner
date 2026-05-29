// Money is a branded bigint count of kopecks (1 ₽ = 100 kopecks).
// One representation across the whole stack; format only at the UI boundary.
declare const moneyBrand: unique symbol;
export type Money = bigint & { readonly [moneyBrand]: true };

/** Convert a rubles number to Money (kopecks), rounding to the nearest kopeck. */
export function rub(rubles: number): Money {
  return BigInt(Math.round(rubles * 100)) as Money;
}

export function addMoney(a: Money, b: Money): Money {
  return (a + b) as Money;
}

/** Multiply Money by an integer count (e.g. per-guest × guests). */
export function mulMoney(a: Money, count: number): Money {
  return (a * BigInt(count)) as Money;
}

/** Format Money as "5 000 ₽" or "7 500,50 ₽" (non-breaking thin space groups). */
export function formatRub(m: Money): string {
  const neg = m < 0n;
  const abs = neg ? -m : m;
  const rubles = abs / 100n;
  const kop = abs % 100n;
  const grouped = rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const tail = kop === 0n ? "" : `,${kop.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${grouped}${tail} ₽`;
}
