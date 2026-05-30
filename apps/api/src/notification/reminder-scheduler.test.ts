import { describe, it, expect, vi } from "vitest";
import { ReminderScheduler } from "./reminder-scheduler";

describe("ReminderScheduler.schedule", () => {
  it("enqueues a delayed job with delay = reminderAt - now", async () => {
    const queue = { add: vi.fn(async () => ({})) } as any;
    const sched = new ReminderScheduler(queue, { nowMs: () => 1_000_000 } as any);
    await sched.schedule({ id: "ci1", reminderAt: new Date(1_060_000) }); // +60s
    expect(queue.add).toHaveBeenCalledWith(
      "reminder", { checklistItemId: "ci1" },
      expect.objectContaining({ delay: 60000, attempts: expect.any(Number), backoff: expect.objectContaining({ type: "exponential" }) }),
    );
  });

  it("enqueues immediately (delay 0) if reminderAt is in the past", async () => {
    const queue = { add: vi.fn(async () => ({})) } as any;
    const sched = new ReminderScheduler(queue, { nowMs: () => 2_000_000 } as any);
    await sched.schedule({ id: "ci1", reminderAt: new Date(1_000_000) });
    expect(queue.add).toHaveBeenCalledWith("reminder", { checklistItemId: "ci1" }, expect.objectContaining({ delay: 0 }));
  });
});
