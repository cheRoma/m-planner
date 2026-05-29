import { describe, it, expect } from "vitest";
import { EstimateRequestSchema } from "./contracts";

describe("EstimateRequestSchema", () => {
  it("accepts a valid request", () => {
    const parsed = EstimateRequestSchema.parse({
      city: "msk", format: "zags", tier: "mid", guests: 80,
    });
    expect(parsed.guests).toBe(80);
  });

  it("rejects guests < 1", () => {
    expect(() => EstimateRequestSchema.parse({ city: "msk", format: "zags", tier: "mid", guests: 0 })).toThrow();
  });

  it("rejects unknown city", () => {
    expect(() => EstimateRequestSchema.parse({ city: "kzn", format: "zags", tier: "mid", guests: 50 })).toThrow();
  });
});
