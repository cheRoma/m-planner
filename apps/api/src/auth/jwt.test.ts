import { describe, it, expect } from "vitest";
import { signSession, verifySession, SessionExpiredError } from "./jwt";

const SECRET = "test-secret";

describe("session jwt", () => {
  it("signs and verifies a session", () => {
    const token = signSession({ userId: "u1" }, SECRET, { ttlSec: 3600, nowSec: 1000 });
    const claims = verifySession(token, SECRET, { nowSec: 1000 });
    expect(claims.userId).toBe("u1");
  });

  it("throws SessionExpiredError after ttl", () => {
    const token = signSession({ userId: "u1" }, SECRET, { ttlSec: 3600, nowSec: 1000 });
    expect(() => verifySession(token, SECRET, { nowSec: 1000 + 3601 })).toThrow(SessionExpiredError);
  });
});
