import { describe, it, expect, vi } from "vitest";
import { RedisCache } from "./redis-cache";

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return "OK"; }),
  } as any;
}

describe("RedisCache.getOrSet", () => {
  it("computes and caches on miss, returns cached on hit", async () => {
    const redis = fakeRedis();
    const cache = new RedisCache(redis);
    const compute = vi.fn(async () => ({ n: 1 }));
    const a = await cache.getOrSet("k", 600, compute);
    const b = await cache.getOrSet("k", 600, compute);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(compute).toHaveBeenCalledTimes(1); // second call served from cache
  });
});
