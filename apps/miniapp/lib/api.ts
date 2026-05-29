const API = process.env.API_URL ?? "http://localhost:3001";

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
