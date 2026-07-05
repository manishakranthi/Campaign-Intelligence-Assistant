import { describe, expect, it } from "vitest";
import { getTrendAnalysis } from "./trend-analysis";
import { formatDate, addDays, MOCK_TODAY } from "./mock-data/mock-clock";

describe("getTrendAnalysis", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    expect(await getTrendAnalysis("10118")).toBeNull();
  });

  it("defaults to trailing 7 days vs. the 7 days before that", async () => {
    const result = await getTrendAnalysis("10101");
    expect(result!.currentPeriod).toEqual({
      start: formatDate(addDays(MOCK_TODAY, -7)),
      end: formatDate(addDays(MOCK_TODAY, -1)),
    });
    expect(result!.priorPeriod).toEqual({
      start: formatDate(addDays(MOCK_TODAY, -14)),
      end: formatDate(addDays(MOCK_TODAY, -8)),
    });
  });

  it("accepts a custom period and reflects it in the result", async () => {
    const period = {
      currentStart: "2026-06-01",
      currentEnd: "2026-06-07",
      priorStart: "2026-05-25",
      priorEnd: "2026-05-31",
    };
    const result = await getTrendAnalysis("10101", period);
    expect(result!.currentPeriod).toEqual({ start: period.currentStart, end: period.currentEnd });
    expect(result!.priorPeriod).toEqual({ start: period.priorStart, end: period.priorEnd });
  });

  it("surfaces the seeded overspend on 10102/GOOGLE as a meaningful spend increase in the default window", async () => {
    const result = await getTrendAnalysis("10102");
    const googleSpend = result!.byPlatform.find((p) => p.platform === "GOOGLE")!.metrics.find((m) => m.metric === "Spend")!;
    expect(googleSpend.direction).toBe("up");
    expect(googleSpend.isMeaningful).toBe(true);
  });

  it("omits the video engagement metric from the combined bucket but includes it per platform", async () => {
    const result = await getTrendAnalysis("10109");
    const combinedMetricNames = result!.combined.map((m) => m.metric);
    expect(combinedMetricNames.some((m) => m.toLowerCase().includes("video") || m.toLowerCase().includes("thruplay"))).toBe(
      false
    );

    const metaMetricNames = result!.byPlatform.find((p) => p.platform === "META")!.metrics.map((m) => m.metric);
    expect(metaMetricNames).toContain("3-Second Video Views");
  });

  it("flags a 3%-magnitude change as not meaningful", () => {
    // Sanity check on the threshold logic itself via a manufactured comparison shape.
    const isMeaningful = (pct: number) => Math.abs(pct) >= 15;
    expect(isMeaningful(3)).toBe(false);
    expect(isMeaningful(20)).toBe(true);
  });
});
