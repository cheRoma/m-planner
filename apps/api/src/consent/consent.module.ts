import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { ConsentService } from "./consent.service";
import { ConsentController } from "./consent.controller";

@Module({
  controllers: [ConsentController],
  providers: [
    ConsentService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "CLOCK", useValue: { nowMs: () => Date.now() } },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
})
export class ConsentModule {}
