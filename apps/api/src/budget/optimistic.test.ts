import { describe, it, expect, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { updateWithVersion } from "./optimistic";

describe("updateWithVersion", () => {
  it("bumps version and returns row when version matches", async () => {
    const delegate = { updateMany: vi.fn(async () => ({ count: 1 })), findUniqueOrThrow: vi.fn(async () => ({ id: "x", version: 3 })) };
    const res = await updateWithVersion(delegate as any, "x", 2, { plannedAmount: 100n });
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { id: "x", version: 2 }, data: { plannedAmount: 100n, version: { increment: 1 } },
    });
    expect(res.version).toBe(3);
  });

  it("throws ConflictException (409) when version does not match", async () => {
    const delegate = { updateMany: vi.fn(async () => ({ count: 0 })), findUniqueOrThrow: vi.fn() };
    await expect(updateWithVersion(delegate as any, "x", 1, { plannedAmount: 1n }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
