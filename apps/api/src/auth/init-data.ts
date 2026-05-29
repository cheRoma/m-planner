import { createHmac, timingSafeEqual } from "node:crypto";

export class InitDataError extends Error {}

export interface TelegramUser { id: number; first_name?: string; username?: string; }
export interface VerifiedInitData { user: TelegramUser; authDateSec: number; }

interface Opts { nowSec: number; maxAgeSec: number; }

/**
 * Validate Telegram Mini App initData:
 *  1. recompute HMAC over the sorted data-check-string and compare (timing-safe)
 *  2. reject if auth_date is older than maxAgeSec (anti-replay, §12.3)
 */
export function parseAndVerifyInitData(initData: string, botToken: string, opts: Opts): VerifiedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new InitDataError("missing hash");
  params.delete("hash");

  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest("hex");

  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InitDataError("bad signature");

  const authDateSec = Number(params.get("auth_date"));
  if (!authDateSec) throw new InitDataError("missing auth_date");
  if (opts.nowSec - authDateSec > opts.maxAgeSec) throw new InitDataError("stale initData (replay)");
  if (authDateSec - opts.nowSec > 60) throw new InitDataError("auth_date in the future");

  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("missing user");
  const user = JSON.parse(userRaw) as TelegramUser;
  return { user, authDateSec };
}
