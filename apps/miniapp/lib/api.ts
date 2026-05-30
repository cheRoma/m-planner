import { type Money } from "@m/shared";

const API = process.env.API_URL ?? "http://localhost:3001";

// Safe coercion of a kopeck string/number into a Money BigInt.
// BigInt(undefined)/BigInt("") throw, which would 500 public SSR routes
// on malformed/partial API payloads. Degrade to 0n instead.
export function kopecks(v: unknown): Money {
  if (v === null || v === undefined || v === "") return 0n as Money;
  try {
    return BigInt(v as string | number | bigint) as Money;
  } catch {
    return 0n as Money;
  }
}

export async function fetchEstimate(body: { city: string; format: string; tier: string; guests: number }) {
  const res = await fetch(`${API}/estimate`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`estimate failed: ${res.status}`);
  return res.json();
}

export async function fetchShowcase(slice: { city: string; tier: string; format: string }) {
  const res = await fetch(`${API}/public/showcase?city=${slice.city}&tier=${slice.tier}&format=${slice.format}`, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`showcase failed: ${res.status}`);
  return res.json();
}
