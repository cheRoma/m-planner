import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { DeletionService } from "./deletion.service";

describe("DeletionService.deleteProject", () => {
  it("purges spend_facts by project_id, then deletes the project (cascade)", async () => {
    const calls: string[] = [];
    const prisma = {
      weddingProject: {
        findUnique: vi.fn(async () => ({ id: "p1", ownerId: "owner1" })),
        delete: vi.fn(async () => { calls.push("project"); return {}; }),
      },
      $transaction: async (fn: any) => fn(prisma),
      spendFact: { deleteMany: vi.fn(async () => { calls.push("spend"); return { count: 3 }; }) },
    } as any;
    const svc = new DeletionService(prisma);
    await svc.deleteProject("p1", "owner1");
    expect(prisma.spendFact.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1" } });
    expect(prisma.weddingProject.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(calls).toEqual(["spend", "project"]); // spend_facts removed before cascade
  });

  it("rejects a non-owner with ForbiddenException and never deletes", async () => {
    const prisma = {
      weddingProject: {
        findUnique: vi.fn(async () => ({ id: "p1", ownerId: "owner1" })),
        delete: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (fn: any) => fn(prisma)),
      spendFact: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    } as any;
    const svc = new DeletionService(prisma);
    await expect(svc.deleteProject("p1", "intruder")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.spendFact.deleteMany).not.toHaveBeenCalled();
    expect(prisma.weddingProject.delete).not.toHaveBeenCalled();
  });
});
