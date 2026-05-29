import { describe, it, expect, vi } from "vitest";
import { AuthService } from "./auth.service";
import { InitDataError } from "./init-data";

const fakePrisma = {
  user: { upsert: vi.fn().mockResolvedValue({ id: "u1", telegramId: 42n }) },
} as any;

describe("AuthService.login", () => {
  const config = { botToken: "123456:TEST", jwtSecret: "s", nowSec: 1_900_000_000, jwtTtlSec: 3600, initDataMaxAgeSec: 86400 };

  it("returns a session token for valid initData", async () => {
    const svc = new AuthService(fakePrisma, config);
    // reuse the helper logic inline: build valid initData
    const { createHmac } = await import("node:crypto");
    const params = new URLSearchParams();
    params.set("auth_date", String(config.nowSec - 5));
    params.set("user", JSON.stringify({ id: 42, first_name: "Roma" }));
    const dc = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(config.botToken).digest();
    params.set("hash", createHmac("sha256", secret).update(dc).digest("hex"));

    const res = await svc.login(params.toString());
    expect(res.token).toBeTypeOf("string");
    expect(fakePrisma.user.upsert).toHaveBeenCalled();
  });

  it("rejects invalid initData", async () => {
    const svc = new AuthService(fakePrisma, config);
    await expect(svc.login("auth_date=1&user=%7B%7D&hash=bad")).rejects.toBeInstanceOf(InitDataError);
  });
});
