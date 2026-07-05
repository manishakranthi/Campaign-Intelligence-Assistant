import { describe, expect, it } from "vitest";
import { detectAnomalies } from "./anomaly-detection";

describe("detectAnomalies", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    expect(await detectAnomalies("10118")).toBeNull();
  });

  it("flags the seeded overspend event on 10102/GOOGLE", async () => {
    const result = await detectAnomalies("10102");
    const found = result!.findings.find((f) => f.type === "overspend" && f.platform === "GOOGLE");
    expect(found).toBeDefined();
    expect(found!.days).toBeGreaterThanOrEqual(2);
  });

  it("flags the seeded underspend event on 10108/TABOOLA", async () => {
    const result = await detectAnomalies("10108");
    const found = result!.findings.find((f) => f.type === "underspend" && f.platform === "TABOOLA");
    expect(found).toBeDefined();
    expect(found!.days).toBeGreaterThanOrEqual(2);
  });

  it("merges the seeded LinkedIn-cut / Meta-echo pair into one cross-platform finding on 10109", async () => {
    const result = await detectAnomalies("10109");
    expect(result!.crossPlatformFindings.length).toBeGreaterThanOrEqual(1);

    const linked = result!.crossPlatformFindings.find(
      (f) => f.primary.platform === "LINKEDIN" && f.linked.platform === "META"
    );
    expect(linked).toBeDefined();
    expect(linked!.daysBetween).toBeGreaterThanOrEqual(1);
    expect(linked!.daysBetween).toBeLessThanOrEqual(5);

    // The two merged findings should not also appear in the standalone findings list.
    const standaloneHasLinkedInCut = result!.findings.some(
      (f) => f.platform === "LINKEDIN" && f.type === "underspend"
    );
    expect(standaloneHasLinkedInCut).toBe(false);
  });
});
