import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseAndVerifyInitData, InitDataError } from "./init-data";

const BOT_TOKEN = "123456:TEST";

// Build a valid initData string the same way Telegram does.
function buildInitData(authDateSec: number, user = { id: 42, first_name: "Roma" }) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDateSec));
  params.set("user", JSON.stringify(user));
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("parseAndVerifyInitData", () => {
  const now = 1_900_000_000; // fixed "now" in seconds

  it("accepts a fresh, correctly signed initData", () => {
    const initData = buildInitData(now - 10);
    const result = parseAndVerifyInitData(initData, BOT_TOKEN, { nowSec: now, maxAgeSec: 86400 });
    expect(result.user.id).toBe(42);
  });

  it("rejects a tampered hash", () => {
    const bad = buildInitData(now - 10).replace(/hash=[0-9a-f]+/, "hash=deadbeef");
    expect(() => parseAndVerifyInitData(bad, BOT_TOKEN, { nowSec: now, maxAgeSec: 86400 }))
      .toThrow(InitDataError);
  });

  it("rejects stale initData (replay) older than maxAge", () => {
    const stale = buildInitData(now - 90000); // > 24h
    expect(() => parseAndVerifyInitData(stale, BOT_TOKEN, { nowSec: now, maxAgeSec: 86400 }))
      .toThrow(/stale/);
  });

  it("rejects future-dated initData", () => {
    const future = buildInitData(now + 3600); // 1h in the future
    expect(() => parseAndVerifyInitData(future, BOT_TOKEN, { nowSec: now, maxAgeSec: 86400 }))
      .toThrow(/future/);
  });
});
