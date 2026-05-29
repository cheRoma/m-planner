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
      useFactory: () => {
        const botToken = process.env.BOT_TOKEN;
        const jwtSecret = process.env.JWT_SECRET;
        if (process.env.NODE_ENV === "production" && (!botToken || !jwtSecret)) {
          throw new Error("BOT_TOKEN and JWT_SECRET must be set in production");
        }
        return {
          botToken: botToken ?? "",
          jwtSecret: jwtSecret ?? "dev-secret",
          jwtTtlSec: 3600,
          initDataMaxAgeSec: 86400,
        };
      },
    },
  ],
  exports: [AuthService, "PRISMA"],
})
export class AuthModule {}
