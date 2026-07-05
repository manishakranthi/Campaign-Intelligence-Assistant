import { describe, expect, it } from "vitest";
import { detectCreativeFatigue } from "./creative-fatigue";

describe("detectCreativeFatigue", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    expect(await detectCreativeFatigue("10118")).toBeNull();
  });

  it("detects the seeded video-fatigue pattern on 10104/META with high confidence (both signals)", async () => {
    const result = await detectCreativeFatigue("10104");
    const finding = result!.findings.find((f) => f.platform === "META");
    expect(finding).toBeDefined();
    expect(finding!.creativeType).toBe("video");
    expect(finding!.engagementMetric).toBe("video_engagement_rate");
    expect(finding!.confidence).toBe("high");
    expect(["climbing-fast", "elevated"]).toContain(finding!.frequencySignal);
    expect(finding!.frequencyEnd).toBeGreaterThan(4.0);
    expect(finding!.engagementDropPct).toBeGreaterThan(25);
  });

  it("detects the seeded static-fatigue pattern on 10112/STACKADAPT via CTR decline, with CPM rising", async () => {
    const result = await detectCreativeFatigue("10112");
    const finding = result!.findings.find((f) => f.platform === "STACKADAPT");
    expect(finding).toBeDefined();
    expect(finding!.creativeType).toBe("static");
    expect(finding!.engagementMetric).toBe("ctr");
    expect(finding!.engagementDropPct).toBeGreaterThan(25);
    expect(finding!.cpmRising).toBe(true);
  });

  it("always returns concrete, campaign-grounded recommendations alongside every finding", async () => {
    const result = await detectCreativeFatigue("10104");
    for (const finding of result!.findings) {
      expect(finding.recommendations.length).toBeGreaterThan(0);
      expect(finding.recommendations.some((r) => r.includes(finding.platform))).toBe(true);
    }
  });
});
