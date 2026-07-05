import { describe, expect, it } from "vitest";
import { getCampaignPerformance, listTicketsWithStatus } from "./campaign-service";
import { SEEDED_SCENARIOS } from "./mock-data/generate-performance-data";

describe("listTicketsWithStatus", () => {
  it("returns all 20 tickets", async () => {
    const tickets = await listTicketsWithStatus();
    expect(tickets).toHaveLength(20);
  });

  it("marks the 3 future-flight tickets as new and the rest as live", async () => {
    const tickets = await listTicketsWithStatus();
    const byId = new Map(tickets.map((t) => [t.campaignId, t]));

    expect(byId.get("10118")?.status).toBe("new");
    expect(byId.get("10119")?.status).toBe("new");
    expect(byId.get("10120")?.status).toBe("new");

    const liveCount = tickets.filter((t) => t.status === "live").length;
    const newCount = tickets.filter((t) => t.status === "new").length;
    expect(liveCount).toBe(17);
    expect(newCount).toBe(3);
  });
});

describe("getCampaignPerformance (join-by-Campaign-ID)", () => {
  it("returns null for a new (not-yet-live) campaign", async () => {
    const result = await getCampaignPerformance("10118");
    expect(result).toBeNull();
  });

  it("aggregates a 5-platform campaign across every platform tab it appears in", async () => {
    const result = await getCampaignPerformance("10109");
    expect(result).not.toBeNull();
    const platformKeys = result!.platforms.map((p) => p.platform).sort();
    expect(platformKeys).toEqual(["GOOGLE", "LINKEDIN", "META", "STACKADAPT", "TABOOLA"].sort());
  });

  it("joins Meta's FB and IG placement rows into one campaign under the META platform", async () => {
    const result = await getCampaignPerformance("10101");
    expect(result).not.toBeNull();
    const metaRows = result!.rowsByPlatform.META ?? [];
    const prefixes = new Set(metaRows.map((r) => r.rawCampaignName.split("_")[0]));
    expect(prefixes.has("FB")).toBe(true);
    expect(prefixes.has("IG")).toBe(true);
    // Every row parsed back to the same Campaign ID regardless of FB/IG prefix.
    expect(metaRows.every((r) => r.campaignId === "10101")).toBe(true);
  });

  it("produces 45-60 days of history for a live campaign", async () => {
    const result = await getCampaignPerformance("10102");
    const days = result!.platforms.find((p) => p.platform === "GOOGLE")?.days ?? 0;
    expect(days).toBeGreaterThanOrEqual(45);
    expect(days).toBeLessThanOrEqual(60);
  });

  it("seeds an overspend event on 10102/GOOGLE (sustained 2+ days > 130% of trailing avg)", async () => {
    const result = await getCampaignPerformance("10102");
    const rows = (result!.rowsByPlatform.GOOGLE ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const last7 = rows.slice(-9, -2);
    const avg = last7.reduce((s, r) => s + r.spend, 0) / last7.length;
    const lastTwo = rows.slice(-2);
    expect(lastTwo.every((r) => r.spend > avg * 1.3)).toBe(true);
  });

  it("seeds an underspend event on 10108/TABOOLA (sustained 2+ days < 50% of trailing avg)", async () => {
    const result = await getCampaignPerformance("10108");
    const rows = (result!.rowsByPlatform.TABOOLA ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const last7 = rows.slice(-9, -2);
    const avg = last7.reduce((s, r) => s + r.spend, 0) / last7.length;
    const lastTwo = rows.slice(-2);
    expect(lastTwo.every((r) => r.spend < avg * 0.5)).toBe(true);
  });

  it("seeds a video-fatigue pattern on 10104/META (Frequency ramps to ~4.6, CTR and video rate decline together)", async () => {
    const result = await getCampaignPerformance("10104");
    const rows = (result!.rowsByPlatform.META ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const lastDay = rows[rows.length - 1];
    expect(lastDay.frequency).not.toBeNull();
    expect(lastDay.frequency as number).toBeGreaterThan(4.0);

    const earlierWindow = rows.slice(-14, -8);
    const laterWindow = rows.slice(-6);
    const earlierCtr = earlierWindow.reduce((s, r) => s + r.ctr, 0) / earlierWindow.length;
    const laterCtr = laterWindow.reduce((s, r) => s + r.ctr, 0) / laterWindow.length;
    expect(laterCtr).toBeLessThan(earlierCtr * 0.85);
  });

  it("seeds a static-fatigue pattern on 10112/STACKADAPT (CTR down >25%, Frequency elevated, CPM up)", async () => {
    const result = await getCampaignPerformance("10112");
    const rows = (result!.rowsByPlatform.STACKADAPT ?? []).sort((a, b) => a.date.localeCompare(b.date));

    // The 7-day fatigue window: compare its first day to its last day for the cumulative drop,
    // matching the spec's "cumulative drop from the start of that window" definition.
    const windowStart = rows[rows.length - 7];
    const windowEnd = rows[rows.length - 1];
    expect(windowEnd.ctr).toBeLessThan(windowStart.ctr * 0.75);
    expect(windowEnd.cpm).toBeGreaterThan(windowStart.cpm);
    expect(windowEnd.frequency).toBeGreaterThanOrEqual(3.5);
  });

  it("seeds a cross-platform-correlated story on 10109 (LinkedIn spend cut precedes a Meta CTR dip)", async () => {
    const result = await getCampaignPerformance("10109");
    const liRows = (result!.rowsByPlatform.LINKEDIN ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const metaRows = (result!.rowsByPlatform.META ?? []).sort((a, b) => a.date.localeCompare(b.date));

    const n = liRows.length;
    const liCutStart = n - 9;
    const liRef = liRows.slice(liCutStart - 7, liCutStart).reduce((s, r) => s + r.spend, 0) / 7;
    expect(liRows[liCutStart].spend).toBeLessThan(liRef * 0.5);

    const metaN = metaRows.length / 2; // FB + IG both present per day
    expect(metaN).toBeGreaterThan(0);
    const metaByDate = new Map<string, number[]>();
    for (const row of metaRows) {
      const list = metaByDate.get(row.date) ?? [];
      list.push(row.ctr);
      metaByDate.set(row.date, list);
    }
    const dates = [...metaByDate.keys()].sort();
    const dipStart = dates.length - 6;
    const refCtr =
      dates
        .slice(dipStart - 7, dipStart)
        .flatMap((d) => metaByDate.get(d) ?? [])
        .reduce((s, v) => s + v, 0) / (7 * 2);
    const dipCtr = metaByDate.get(dates[dipStart])?.[0] ?? 0;
    expect(dipCtr).toBeLessThan(refCtr * 0.75);
  });

  it("exposes exactly the 6 seeded scenario placements the spec calls for", () => {
    expect(SEEDED_SCENARIOS).toHaveLength(6);
    const kinds = SEEDED_SCENARIOS.map((s) => s.kind).sort();
    expect(kinds).toEqual(
      [
        "cross-platform-linkedin-cut",
        "cross-platform-meta-echo",
        "overspend",
        "static-fatigue",
        "underspend",
        "video-fatigue",
      ].sort()
    );
  });
});
