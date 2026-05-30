import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { DeadlinesService } from "./deadlines.service";

describe("DeadlinesService", () => {
  it("lists upcoming non-done deadlines with delivery status (single source)", async () => {
    const prisma = {
      projectMember: { findUnique: vi.fn(async () => ({ projectId: "p1", userId: "u1", role: "owner" })) },
      checklistItem: { findMany: vi.fn(async () => [
        { id: "ci1", title: "ЗАГС", dueDate: new Date("2026-07-28"), reminderStatus: "blocked", done: false, ackAt: null },
      ]) },
    } as any;
    const svc = new DeadlinesService(prisma);
    const res = await svc.upcoming("p1", "u1");
    expect(res[0]).toMatchObject({ id: "ci1", reminderStatus: "blocked" });
  });

  it("rejects upcoming for a non-member with ForbiddenException", async () => {
    const prisma = {
      projectMember: { findUnique: vi.fn(async () => null) },
      checklistItem: { findMany: vi.fn(async () => []) },
    } as any;
    const svc = new DeadlinesService(prisma);
    await expect(svc.upcoming("p1", "intruder")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.checklistItem.findMany).not.toHaveBeenCalled();
  });

  it("ack sets ackAt so push and view both stop (dedup)", async () => {
    const prisma = {
      projectMember: { findUnique: vi.fn(async () => ({ projectId: "p1", userId: "u1", role: "owner" })) },
      checklistItem: {
        findUniqueOrThrow: vi.fn(async () => ({ id: "ci1", projectId: "p1" })),
        update: vi.fn(async () => ({})),
      },
    } as any;
    const svc = new DeadlinesService(prisma, { nowMs: () => 1000 } as any);
    await svc.ack("ci1", "u1");
    expect(prisma.checklistItem.update).toHaveBeenCalledWith({ where: { id: "ci1" }, data: { ackAt: new Date(1000) } });
  });
});
