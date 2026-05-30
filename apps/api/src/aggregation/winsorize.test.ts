import { describe, it, expect } from "vitest";
import { winsorize, percentiles } from "./winsorize";

describe("winsorize", () => {
  it("clamps extreme outliers to the 5th/95th percentile", () => {
    const xs = [10n, 12n, 11n, 13n, 12n, 1000000n]; // one absurd outlier
    const w = winsorize(xs, 0.05);
    expect(Math.max(...w.map(Number))).toBeLessThan(1000000);
  });
  it("drops zeros and negatives", () => {
    expect(winsorize([0n, -5n, 10n, 12n], 0.05).every((x) => x > 0n)).toBe(true);
  });
});

describe("percentiles", () => {
  it("computes p25/median/p75", () => {
    const p = percentiles([10n, 20n, 30n, 40n, 50n]);
    expect(p.median).toBe(30n);
    expect(p.p25).toBe(20n);
    expect(p.p75).toBe(40n);
  });
});
