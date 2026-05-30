import { Injectable, Inject, ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { generateInviteToken } from "./invite-token";

export interface Clock {
  nowMs(): number;
}

@Injectable()
export class InviteService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("CLOCK") private readonly clock: Clock,
  ) {}

  async create(projectId: string, userId: string, ttlDays: number): Promise<{ token: string; expiresAt: Date }> {
    // Authz: only the project owner may mint invites.
    const project = await this.prisma.weddingProject.findUnique({ where: { id: projectId } });
    if (!project || project.ownerId !== userId) throw new ForbiddenException("not project owner");

    const token = generateInviteToken();
    const expiresAt = new Date(this.clock.nowMs() + ttlDays * 86400 * 1000);
    await this.prisma.inviteToken.create({ data: { token, projectId, role: "partner", expiresAt } });
    return { token, expiresAt };
  }

  async accept(token: string, userId: string): Promise<{ projectId: string }> {
    const now = new Date(this.clock.nowMs());
    return this.prisma.$transaction(async (tx) => {
      // Atomic one-time claim: only succeeds if not already accepted/revoked and not expired.
      const claim = await tx.inviteToken.updateMany({
        where: { token, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (claim.count === 0) throw new ForbiddenException("invite not usable");
      const row = await tx.inviteToken.findUniqueOrThrow({ where: { token } });
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: row.projectId, userId } },
        update: {}, // Do NOT clobber an existing member's role (no owner-downgrade).
        create: { projectId: row.projectId, userId, role: row.role },
      });
      return { projectId: row.projectId };
    });
  }

  async revoke(token: string, userId: string): Promise<void> {
    // Authz: only the project owner may revoke invites.
    const row = await this.prisma.inviteToken.findUnique({ where: { token } });
    if (!row) throw new ForbiddenException("invite not found");
    const project = await this.prisma.weddingProject.findUnique({ where: { id: row.projectId } });
    if (!project || project.ownerId !== userId) throw new ForbiddenException("not project owner");

    await this.prisma.inviteToken.update({
      where: { token },
      data: { revokedAt: new Date(this.clock.nowMs()) },
    });
  }
}
