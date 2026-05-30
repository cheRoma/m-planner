import { describe, it, expect } from "vitest";
import { generateInviteToken } from "./invite-token";

describe("generateInviteToken", () => {
  it("produces a long url-safe token", () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });
  it("produces unique tokens", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken());
  });
});
