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

  async create(projectId: string, ttlDays: number): Promise<{ token: string; expiresAt: Date }> {
    const token = generateInviteToken();
    const expiresAt = new Date(this.clock.nowMs() + ttlDays * 86400 * 1000);
    await this.prisma.inviteToken.create({ data: { token, projectId, role: "partner", expiresAt } });
    return { token, expiresAt };
  }

  async accept(token: string, userId: string): Promise<{ projectId: string }> {
    const row = await this.prisma.inviteToken.findUnique({ where: { token } });
    if (!row) throw new ForbiddenException("invite not found");
    if (row.revokedAt) throw new ForbiddenException("invite revoked");
    if (row.acceptedAt) throw new ForbiddenException("invite already used");
    if (row.expiresAt.getTime() < this.clock.nowMs()) throw new ForbiddenException("invite expired");

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: row.projectId, userId } },
      update: { role: row.role },
      create: { projectId: row.projectId, userId, role: row.role },
    });
    await this.prisma.inviteToken.update({
      where: { token },
      data: { acceptedAt: new Date(this.clock.nowMs()) },
    });
    return { projectId: row.projectId };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.inviteToken.update({
      where: { token },
      data: { revokedAt: new Date(this.clock.nowMs()) },
    });
  }
}
