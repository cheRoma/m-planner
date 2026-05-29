import { describe, it, expect } from "vitest";
import { HttpException } from "@nestjs/common";
import { RateLimitGuard } from "./rate-limit.guard";

function fakeRedis() {
  const store = new Map<string, number>();
  return {
    incr: async (k: string) => { const n = (store.get(k) ?? 0) + 1; store.set(k, n); return n; },
    expire: async () => 1,
  } as any;
}
function ctx(ip: string) {
  const req: any = { ip, headers: {}, route: { path: "/estimate" } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe("RateLimitGuard", () => {
  it("allows up to the limit then throws 429", async () => {
    const guard = new RateLimitGuard(fakeRedis(), { limit: 3, windowSec: 60 });
    const c = ctx("1.2.3.4");
    expect(await guard.canActivate(c)).toBe(true);
    expect(await guard.canActivate(c)).toBe(true);
    expect(await guard.canActivate(c)).toBe(true);
    await expect(guard.canActivate(c)).rejects.toBeInstanceOf(HttpException);
  });
});
