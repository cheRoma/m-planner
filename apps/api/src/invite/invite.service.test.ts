import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { InviteService } from "./invite.service";

function fakePrisma(token?: any) {
  return {
    inviteToken: {
      create: vi.fn(async ({ data }: any) => ({ ...data })),
      findUnique: vi.fn(async () => token ?? null),
      update: vi.fn(async () => ({})),
    },
    projectMember: { upsert: vi.fn(async () => ({})) },
  } as any;
}
const cfg = { nowMs: () => 1_000_000 } as any;

describe("InviteService", () => {
  it("creates a token with expiry", async () => {
    const prisma = fakePrisma();
    const svc = new InviteService(prisma, cfg);
    const res = await svc.create("p1", 7);
    expect(res.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(prisma.inviteToken.create).toHaveBeenCalled();
  });

  it("accept: binds partner once, then invalidates token", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: null });
    const svc = new InviteService(prisma, cfg);
    await svc.accept("t", "u2");
    expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ projectId: "p1", userId: "u2", role: "partner" }) }),
    );
    expect(prisma.inviteToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acceptedAt: expect.anything() }) }),
    );
  });

  it("accept: rejects expired token", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(500_000), acceptedAt: null, revokedAt: null });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accept: rejects already-accepted token (one-time)", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: new Date(900_000), revokedAt: null });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accept: rejects revoked token", async () => {
    const prisma = fakePrisma({ token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: new Date(900_000) });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
