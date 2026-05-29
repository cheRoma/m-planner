import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: "PRISMA", useValue: prisma },
    {
      provide: "AUTH_CONFIG",
      useValue: {
        botToken: process.env.BOT_TOKEN ?? "",
        jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
        jwtTtlSec: 3600,
        initDataMaxAgeSec: 86400,
      },
    },
  ],
  exports: [AuthService, "PRISMA"],
})
export class AuthModule {}
