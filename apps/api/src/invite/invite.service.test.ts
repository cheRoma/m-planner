import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { InviteService } from "./invite.service";

function fakePrisma(opts: { token?: any; claimCount?: number; ownerId?: string } = {}) {
  const { token, claimCount = 1, ownerId = "u1" } = opts;
  const prisma: any = {
    inviteToken: {
      create: vi.fn(async ({ data }: any) => ({ ...data })),
      findUnique: vi.fn(async () => token ?? null),
      findUniqueOrThrow: vi.fn(async () => {
        if (!token) throw new Error("not found");
        return token;
      }),
      updateMany: vi.fn(async () => ({ count: claimCount })),
      update: vi.fn(async () => ({})),
    },
    projectMember: { upsert: vi.fn(async () => ({})) },
    weddingProject: { findUnique: vi.fn(async () => (ownerId ? { id: "p1", ownerId } : null)) },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}
const cfg = { nowMs: () => 1_000_000 } as any;

describe("InviteService", () => {
  it("creates a token with expiry", async () => {
    const prisma = fakePrisma();
    const svc = new InviteService(prisma, cfg);
    const res = await svc.create("p1", "u1", 7);
    expect(res.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(prisma.inviteToken.create).toHaveBeenCalled();
  });

  it("create: rejects non-owner", async () => {
    const prisma = fakePrisma({ ownerId: "someone-else" });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.create("p1", "u1", 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.inviteToken.create).not.toHaveBeenCalled();
  });

  it("accept: binds partner once via atomic claim", async () => {
    const prisma = fakePrisma({
      token: { token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: null },
      claimCount: 1,
    });
    const svc = new InviteService(prisma, cfg);
    await svc.accept("t", "u2");
    expect(prisma.inviteToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acceptedAt: expect.anything() }) }),
    );
    expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ projectId: "p1", userId: "u2", role: "partner" }),
        update: {},
      }),
    );
  });

  it("accept: rejects expired token (claim count 0)", async () => {
    const prisma = fakePrisma({
      token: { token: "t", projectId: "p1", role: "partner", expiresAt: new Date(500_000), acceptedAt: null, revokedAt: null },
      claimCount: 0,
    });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.projectMember.upsert).not.toHaveBeenCalled();
  });

  it("accept: rejects already-accepted token (one-time, claim count 0)", async () => {
    const prisma = fakePrisma({
      token: { token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: new Date(900_000), revokedAt: null },
      claimCount: 0,
    });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accept: rejects revoked token (claim count 0)", async () => {
    const prisma = fakePrisma({
      token: { token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: new Date(900_000) },
      claimCount: 0,
    });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.accept("t", "u2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("revoke: owner sets revokedAt", async () => {
    const prisma = fakePrisma({
      token: { token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: null },
      ownerId: "u1",
    });
    const svc = new InviteService(prisma, cfg);
    await svc.revoke("t", "u1");
    expect(prisma.inviteToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.anything() }) }),
    );
  });

  it("revoke: rejects non-owner", async () => {
    const prisma = fakePrisma({
      token: { token: "t", projectId: "p1", role: "partner", expiresAt: new Date(2_000_000), acceptedAt: null, revokedAt: null },
      ownerId: "someone-else",
    });
    const svc = new InviteService(prisma, cfg);
    await expect(svc.revoke("t", "u1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.inviteToken.update).not.toHaveBeenCalled();
  });
});
