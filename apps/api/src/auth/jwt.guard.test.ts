import { describe, it, expect } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { JwtGuard } from "./jwt.guard";
import { signSession } from "./jwt";

const SECRET = "s";
function ctx(authHeader?: string) {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return { switchToHttp: () => ({ getRequest: () => req }), } as any;
}

describe("JwtGuard", () => {
  const guard = new JwtGuard({ jwtSecret: SECRET } as any);
  it("allows a valid token and attaches userId", () => {
    const token = signSession({ userId: "u1" }, SECRET, { ttlSec: 3600 });
    const c = ctx(`Bearer ${token}`);
    expect(guard.canActivate(c)).toBe(true);
    expect(c.switchToHttp().getRequest().userId).toBe("u1");
  });
  it("rejects missing token", () => {
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });
});
