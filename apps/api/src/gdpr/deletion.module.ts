import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { DeletionService } from "./deletion.service";
import { DeletionController } from "./deletion.controller";

@Module({
  controllers: [DeletionController],
  providers: [
    DeletionService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
})
export class DeletionModule {}
