import { describe, expect, it } from "vitest";
import { recommendBudgetReallocation } from "./budget-recommendation";
import { suggestAudienceExpansion } from "./audience-expansion";

describe("recommendBudgetReallocation", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    expect(await recommendBudgetReallocation("10118")).toBeNull();
  });

  it("uses CPM efficiency for an AWR (impressions) goal", async () => {
    const result = await recommendBudgetReallocation("10102"); // SummerSneakerLaunch: AWR
    expect(result!.efficiencyMetric).toBe("cpm");
    expect(result!.applicable).toBe(true);
    expect(result!.ranked.length).toBe(5);
  });

  it("uses cost-per-click efficiency for a PV (page views) goal", async () => {
    const result = await recommendBudgetReallocation("10101"); // SpringSaleApparel: PV
    expect(result!.efficiencyMetric).toBe("cpc");
  });

  it("never recommends zeroing out the weaker platform, and shifts a bounded 15-20% of its daily spend", async () => {
    const result = await recommendBudgetReallocation("10109");
    expect(result!.shiftPercent).toBeGreaterThanOrEqual(15);
    expect(result!.shiftPercent).toBeLessThanOrEqual(20);
    expect(result!.shiftAmount).toBeGreaterThan(0);
    expect(result!.shiftAmount).toBeLessThan(
      result!.ranked.find((r) => r.platform === result!.weakestPlatform)!.dailySpend
    );
    expect(result!.recommendation.toLowerCase()).not.toContain("cut it entirely");
  });

  it("ranks the strongest platform first (lowest cost-per-outcome) and weakest last", async () => {
    const result = await recommendBudgetReallocation("10109");
    expect(result!.ranked[0].platform).toBe(result!.strongestPlatform);
    expect(result!.ranked[result!.ranked.length - 1].platform).toBe(result!.weakestPlatform);
    expect(result!.ranked[0].efficiencyValue).toBeLessThanOrEqual(result!.ranked[result!.ranked.length - 1].efficiencyValue);
  });
});

describe("suggestAudienceExpansion", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    expect(await suggestAudienceExpansion("10118")).toBeNull();
  });

  it("returns trending audience angles for a live campaign", async () => {
    const result = await suggestAudienceExpansion("10109");
    expect(result).not.toBeNull();
    expect(typeof result!.isUnderperforming).toBe("boolean");
    expect(result!.trendingAudience).not.toBeNull();
    expect(result!.suggestedAngles.length).toBeGreaterThan(0);
  });
});
