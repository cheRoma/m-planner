import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import type { Clock } from "../invite/invite.service";

@Injectable()
export class ConsentService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("CLOCK") private readonly clock: Clock,
  ) {}

  async grant(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { consentAt: new Date(this.clock.nowMs()) } });
  }

  async has(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return Boolean(u?.consentAt);
  }
}
