import { describe, it, expect, vi } from "vitest";
import { ConsentService } from "./consent.service";

describe("ConsentService", () => {
  it("records consent timestamp", async () => {
    const prisma = { user: { update: vi.fn(async () => ({ consentAt: new Date() })) } } as any;
    const svc = new ConsentService(prisma, { nowMs: () => 1000 } as any);
    await svc.grant("u1");
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { consentAt: new Date(1000) } });
  });

  it("reports whether consent is present", async () => {
    const prisma = { user: { findUnique: vi.fn(async () => ({ consentAt: new Date() })) } } as any;
    const svc = new ConsentService(prisma, { nowMs: () => 1000 } as any);
    expect(await svc.has("u1")).toBe(true);
  });
});
