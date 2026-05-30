import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { InviteService } from "./invite.service";
import { InviteController } from "./invite.controller";

@Module({
  controllers: [InviteController],
  providers: [
    InviteService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "CLOCK", useValue: { nowMs: () => Date.now() } },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
})
export class InviteModule {}
