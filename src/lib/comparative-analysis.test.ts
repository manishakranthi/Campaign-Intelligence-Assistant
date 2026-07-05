import { describe, expect, it } from "vitest";
import { getComparativeAnalysis } from "./comparative-analysis";

describe("getComparativeAnalysis", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    expect(await getComparativeAnalysis("10118")).toBeNull();
  });

  it("produces peer-campaign comparisons for a platform with other live campaigns", async () => {
    const result = await getComparativeAnalysis("10101"); // Meta has plenty of other live campaigns
    const metaComparisons = result!.peerComparisons.filter((c) => c.platform === "META");
    expect(metaComparisons.length).toBe(2); // ctr + cpm
    for (const c of metaComparisons) {
      expect(c.peerCount).toBeGreaterThan(0);
      expect(typeof c.isBetterThanPeers).toBe("boolean");
    }
  });

  it("produces one cross-platform comparison per platform for a multi-platform campaign", async () => {
    const result = await getComparativeAnalysis("10109"); // 5 platforms
    expect(result!.crossPlatformComparisons.length).toBe(5);
    const platforms = result!.crossPlatformComparisons.map((c) => c.platform).sort();
    expect(platforms).toEqual(["GOOGLE", "LINKEDIN", "META", "STACKADAPT", "TABOOLA"].sort());
    for (const c of result!.crossPlatformComparisons) {
      expect(c.otherPlatforms).not.toContain(c.platform);
      expect(c.otherPlatforms.length).toBe(4);
    }
  });

  it("returns no cross-platform comparisons for a single-platform-only view is impossible in this dataset, but handles multi gracefully", async () => {
    // Every ticket spans >= 2 platforms per the mock dataset, so just confirm the 2-platform case works.
    const result = await getComparativeAnalysis("10114"); // LuxuryWatchHolidayCampaign: META, TABOOLA
    expect(result!.crossPlatformComparisons.length).toBe(2);
  });
});
