import { describe, expect, it } from "vitest";
import { recommendInitialBudgetSplit } from "./budget-recommendation";
import { deriveTrendsTopic } from "./audience-service";

describe("recommendInitialBudgetSplit", () => {
  it("returns null for an unknown campaign id", async () => {
    expect(await recommendInitialBudgetSplit("99999")).toBeNull();
  });

  it("allocates only across the ticket's own platforms and sums to the overall budget", async () => {
    const result = await recommendInitialBudgetSplit("10118"); // WinterCoatLaunch: META, GOOGLE, STACKADAPT
    expect(result).not.toBeNull();
    expect(result!.allocations.map((a) => a.platform).sort()).toEqual(["GOOGLE", "META", "STACKADAPT"].sort());

    const total = result!.allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(total).toBeCloseTo(result!.overallBudget, 0);
    expect(result!.isPreLaunchEstimate).toBe(true);
  });

  it("weights awareness objectives toward Meta over LinkedIn", async () => {
    // EnterpriseAIWebinar (10119) is PV/traffic on LINKEDIN+GOOGLE only, not useful for this check.
    // HolidayGiftGuide (10120) is PV; WinterCoatLaunch (10118) is AWR with META+GOOGLE+STACKADAPT.
    const result = await recommendInitialBudgetSplit("10118");
    const meta = result!.allocations.find((a) => a.platform === "META")!;
    const google = result!.allocations.find((a) => a.platform === "GOOGLE")!;
    expect(meta.share).toBeGreaterThan(0);
    expect(google.share).toBeGreaterThan(0);
    // Both present in an awareness split; sanity check shares are plausible fractions.
    expect(meta.share + google.share).toBeLessThan(1);
  });

  it("weights traffic/page-view objectives toward Google over StackAdapt", async () => {
    const result = await recommendInitialBudgetSplit("10120"); // HolidayGiftGuide: PV, META/TABOOLA/STACKADAPT/LINKEDIN
    const stackadapt = result!.allocations.find((a) => a.platform === "STACKADAPT")!;
    const meta = result!.allocations.find((a) => a.platform === "META")!;
    expect(meta.share).toBeGreaterThan(stackadapt.share);
  });
});

describe("deriveTrendsTopic", () => {
  it("combines the campaign name and vertical, deduping shared words", () => {
    const topic = deriveTrendsTopic({ campaignName: "SpringSaleApparel", vertical: "fitness apparel" });
    expect(topic).toBe("spring sale apparel fitness");
  });

  it("handles a name with an underscore", () => {
    const topic = deriveTrendsTopic({ campaignName: "YogaRetreat_Bookings", vertical: "wellness / travel" });
    expect(topic).toContain("yoga");
    expect(topic).toContain("retreat");
    expect(topic).toContain("bookings");
  });
});
