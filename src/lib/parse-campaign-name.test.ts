import { describe, expect, it, vi } from "vitest";
import { parseCampaignName } from "./parse-campaign-name";

describe("parseCampaignName", () => {
  it("parses a standard Meta (Facebook) campaign name", () => {
    const result = parseCampaignName("FB_10293_SpringSale2026_PV");
    expect(result).toMatchObject({
      platformPrefix: "FB",
      isKnownPrefix: true,
      campaignId: "10293",
      campaignName: "SpringSale2026",
      goalType: "PV",
      isWellFormed: true,
    });
  });

  it("parses a standard Instagram campaign name", () => {
    const result = parseCampaignName("IG_10293_SpringSale2026_PV");
    expect(result.platformPrefix).toBe("IG");
    expect(result.campaignId).toBe("10293");
  });

  it("parses LinkedIn, Google Ads, StackAdapt, and Taboola prefixes", () => {
    expect(parseCampaignName("LI_55001_B2BSaaSLaunch_LEAD").platformPrefix).toBe("LI");
    expect(parseCampaignName("GA_55001_B2BSaaSLaunch_LEAD").platformPrefix).toBe("GA");
    expect(parseCampaignName("SA_55001_B2BSaaSLaunch_LEAD").platformPrefix).toBe("SA");
    expect(parseCampaignName("TB_55001_B2BSaaSLaunch_LEAD").platformPrefix).toBe("TB");
  });

  it("rejoins a name segment that itself contains underscores", () => {
    const result = parseCampaignName("FB_10293_Spring_Sale_2026_Apparel_PV");
    expect(result.campaignName).toBe("Spring_Sale_2026_Apparel");
    expect(result.goalType).toBe("PV");
    expect(result.campaignId).toBe("10293");
    expect(result.isWellFormed).toBe(true);
  });

  it("handles a missing goal type code by treating the last segment as the name", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCampaignName("FB_10293_SpringSale2026");
    expect(result.campaignId).toBe("10293");
    expect(result.campaignName).toBe("SpringSale2026");
    expect(result.goalType).toBeNull();
    expect(result.isWellFormed).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("handles an unrecognized platform prefix without crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCampaignName("XX_10293_SpringSale2026_PV");
    expect(result.platformPrefix).toBe("XX");
    expect(result.isKnownPrefix).toBe(false);
    expect(result.campaignId).toBe("10293");
    expect(result.isWellFormed).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("handles empty string input without crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCampaignName("");
    expect(result).toMatchObject({
      platformPrefix: "",
      campaignId: "",
      campaignName: "",
      goalType: null,
      isWellFormed: false,
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("handles a name with only a prefix and ID (no name/goal) without crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCampaignName("FB_10293");
    expect(result.campaignId).toBe("10293");
    expect(result.isWellFormed).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("is case-insensitive on the platform prefix but preserves case elsewhere", () => {
    const result = parseCampaignName("fb_10293_SpringSale2026_pv");
    expect(result.platformPrefix).toBe("FB");
    expect(result.campaignName).toBe("SpringSale2026");
    expect(result.goalType).toBe("pv");
  });

  it("ignores extraneous leading/trailing whitespace", () => {
    const result = parseCampaignName("  FB_10293_SpringSale2026_PV  ");
    expect(result.campaignId).toBe("10293");
    expect(result.campaignName).toBe("SpringSale2026");
  });

  it("collapses accidental double underscores instead of producing empty segments", () => {
    const result = parseCampaignName("FB_10293__SpringSale2026_PV");
    expect(result.campaignId).toBe("10293");
    expect(result.campaignName).toBe("SpringSale2026");
    expect(result.goalType).toBe("PV");
  });
});
