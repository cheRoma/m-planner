import { describe, it, expect, vi } from "vitest";
import { ProjectService } from "./project.service";

const created: any[] = [];
const fakePrisma = {
  $transaction: async (fn: any) => fn(fakePrisma),
  weddingProject: { create: vi.fn(async ({ data }: any) => { const p = { id: "p1", ...data }; created.push(p); return p; }) },
  projectMember: { create: vi.fn(async () => ({})) },
  category: { findMany: vi.fn(async () => [{ id: "c1", slug: "banquet" }, { id: "c2", slug: "photo" }]) },
  budgetItem: { createMany: vi.fn(async () => ({ count: 2 })) },
} as any;

describe("ProjectService.createFromEstimate", () => {
  it("creates project, owner membership, and budget items per estimate line", async () => {
    const svc = new ProjectService(fakePrisma);
    const res = await svc.createFromEstimate("u1", {
      city: "msk", format: "zags", tier: "mid", guests: 80, weddingDate: "2026-09-01",
      lines: [
        { categorySlug: "banquet", plannedAmount: "40000000" },
        { categorySlug: "photo", plannedAmount: "8000000" },
      ],
    });
    expect(res.projectId).toBe("p1");
    expect(fakePrisma.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "owner", userId: "u1" }) }),
    );
    expect(fakePrisma.budgetItem.createMany).toHaveBeenCalled();
  });
});
