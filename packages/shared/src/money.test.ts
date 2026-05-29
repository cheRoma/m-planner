import { describe, it, expect } from "vitest";
import { rub, formatRub, addMoney, type Money } from "./money";

describe("Money (bigint kopecks)", () => {
  it("rub() converts rubles to kopecks as bigint", () => {
    expect(rub(5000)).toBe(500000n as Money);
  });

  it("rub() rounds to whole kopecks (no float drift)", () => {
    expect(rub(0.1 + 0.2)).toBe(30n as Money); // 0.30000000000000004 → 30 kopecks
  });

  it("addMoney() sums kopecks exactly", () => {
    expect(addMoney(rub(5000), rub(2500.5))).toBe(750050n as Money);
  });

  it("formatRub() renders thousands separator and ₽, drops .00", () => {
    expect(formatRub(500000n as Money)).toBe("5 000 ₽");
    expect(formatRub(750050n as Money)).toBe("7 500,50 ₽");
  });
});
