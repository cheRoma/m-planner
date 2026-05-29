import { Injectable, Inject } from "@nestjs/common";
import type { PrismaClient } from "@m/db";
import { parseAndVerifyInitData } from "./init-data";
import { signSession } from "./jwt";

export interface AuthConfig {
  botToken: string; jwtSecret: string; jwtTtlSec: number; initDataMaxAgeSec: number; nowSec?: number;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject("PRISMA") private readonly prisma: PrismaClient,
    @Inject("AUTH_CONFIG") private readonly config: AuthConfig,
  ) {}

  async login(initData: string): Promise<{ token: string; userId: string }> {
    const nowSec = this.config.nowSec ?? Math.floor(Date.now() / 1000);
    const verified = parseAndVerifyInitData(initData, this.config.botToken, {
      nowSec, maxAgeSec: this.config.initDataMaxAgeSec,
    });
    const user = await this.prisma.user.upsert({
      where: { telegramId: BigInt(verified.user.id) },
      update: { name: verified.user.first_name ?? null },
      create: { telegramId: BigInt(verified.user.id), name: verified.user.first_name ?? null },
    });
    const token = signSession({ userId: user.id }, this.config.jwtSecret, { ttlSec: this.config.jwtTtlSec, nowSec });
    return { token, userId: user.id };
  }
}
