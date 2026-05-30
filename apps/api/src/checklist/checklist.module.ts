import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { ChecklistService } from "./checklist.service";
import { ChecklistController } from "./checklist.controller";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [NotificationModule], // provides ReminderScheduler for instantiate()
  controllers: [ChecklistController],
  providers: [
    ChecklistService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
  exports: [ChecklistService],
})
export class ChecklistModule {}
