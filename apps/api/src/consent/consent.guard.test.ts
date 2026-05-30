import { describe, it, expect, vi } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConsentGuard } from "./consent.guard";

function ctx(userId?: string) {
  const req: any = { userId };
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

describe("ConsentGuard", () => {
  it("allows the request when the user has granted consent", async () => {
    const consent = { has: vi.fn(async () => true) } as any;
    const guard = new ConsentGuard(consent);
    await expect(guard.canActivate(ctx("u1"))).resolves.toBe(true);
    expect(consent.has).toHaveBeenCalledWith("u1");
  });

  it("rejects with 403 when consent is missing (152-FZ)", async () => {
    const consent = { has: vi.fn(async () => false) } as any;
    const guard = new ConsentGuard(consent);
    await expect(guard.canActivate(ctx("u1"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects with 401 when no userId is present (guard ordering safety)", async () => {
    const consent = { has: vi.fn() } as any;
    const guard = new ConsentGuard(consent);
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(consent.has).not.toHaveBeenCalled();
  });
});
