import { Module } from "@nestjs/common";
import { prisma } from "@m/db";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { ChecklistModule } from "../checklist/checklist.module";
import { ConsentModule } from "../consent/consent.module";

@Module({
  imports: [ChecklistModule, ConsentModule],
  controllers: [ProjectController],
  providers: [
    ProjectService,
    { provide: "PRISMA", useValue: prisma },
    { provide: "AUTH_CONFIG", useValue: { jwtSecret: process.env.JWT_SECRET ?? "dev-secret" } },
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
