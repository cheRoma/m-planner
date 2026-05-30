import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { ConsentService } from "./consent.service";
import { ConsentController } from "./consent.controller";
import { ConsentGuard } from "./consent.guard";

@Module({
  controllers: [ConsentController],
  providers: [
    ConsentService,
    ConsentGuard,
    { provide: "PRISMA", useValue: prisma },
    { provide: "CLOCK", useValue: { nowMs: () => Date.now() } },
  ],
  exports: [ConsentService, ConsentGuard],
})
export class ConsentModule {}
