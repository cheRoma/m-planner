import { randomBytes } from "node:crypto";

/** Long, crypto-random, url-safe invite token (11.7 — not guessable). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}
