import { describe, expect, it } from "vitest";
import { getPacingStatus } from "./pacing";
import { getCampaignPerformance } from "./campaign-service";

describe("getPacingStatus", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    expect(await getPacingStatus("10118")).toBeNull();
  });

  it("maps a PV goal to Clicks and an AWR goal to Impressions", async () => {
    const pv = await getPacingStatus("10101"); // SpringSaleApparel: PV goal
    expect(pv!.goalMetric).toBe("clicks");

    const awr = await getPacingStatus("10102"); // SummerSneakerLaunch: AWR goal
    expect(awr!.goalMetric).toBe("impressions");
  });

  it("computes daysElapsed consistent with the generated performance history length", async () => {
    const pacing = await getPacingStatus("10102");
    const performance = await getCampaignPerformance("10102");
    const historyDays = performance!.platforms.find((p) => p.platform === "GOOGLE")!.days;
    expect(pacing!.daysElapsed).toBe(historyDays);
  });

  it("computes expected spend/goal to date as a straight pro-ration of elapsed flight time", async () => {
    const pacing = await getPacingStatus("10101");
    const elapsedFraction = pacing!.daysElapsed / pacing!.flightLengthDays;
    expect(pacing!.expectedSpendToDate).toBeCloseTo(pacing!.overallBudget * elapsedFraction, 0);
    expect(pacing!.expectedGoalToDate).toBeCloseTo(pacing!.goalAmount * elapsedFraction, 0);
  });

  it("returns a valid pacing status enum for both spend and goal", async () => {
    const pacing = await getPacingStatus("10109");
    expect(["on-pace", "over-pacing", "under-pacing"]).toContain(pacing!.spendPacingStatus);
    expect(["on-pace", "over-pacing", "under-pacing"]).toContain(pacing!.goalPacingStatus);
    expect(pacing!.projectedGoalAtFlightEnd).toBeGreaterThan(0);
  });
});
