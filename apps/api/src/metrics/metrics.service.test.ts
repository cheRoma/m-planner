import { describe, it, expect } from "vitest";
import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  it("counts named events and exposes a snapshot", () => {
    const m = new MetricsService();
    m.inc("estimate_share");
    m.inc("estimate_share");
    m.inc("project_saved");
    expect(m.snapshot()).toEqual({ estimate_share: 2, project_saved: 1 });
  });
});
