import { getCampaignPerformance } from "./campaign-service";
import { getDataSource, PerformanceRow } from "./data-source";
import { PlatformKey } from "./platforms";

export interface PeerComparisonFinding {
  axis: "peer-campaigns";
  platform: PlatformKey;
  metric: "ctr" | "cpm";
  thisCampaignValue: number;
  peerAverage: number;
  peerCount: number;
  percentDifference: number;
  isBetterThanPeers: boolean;
  description: string;
}

export interface CrossPlatformComparisonFinding {
  axis: "cross-platform";
  platform: PlatformKey;
  otherPlatforms: PlatformKey[];
  ctrValue: number;
  ctrOthersAverage: number;
  ctrPercentDifference: number;
  cpmValue: number;
  cpmOthersAverage: number;
  cpmPercentDifference: number;
  description: string;
}

export interface ComparativeAnalysisResult {
  campaignId: string;
  peerComparisons: PeerComparisonFinding[];
  /** The differentiator: only possible because data spans platforms for the same Campaign ID. */
  crossPlatformComparisons: CrossPlatformComparisonFinding[];
}

function percentDiff(mine: number, benchmark: number): number {
  if (benchmark === 0) return 0;
  return Number((((mine - benchmark) / benchmark) * 100).toFixed(1));
}

interface CampaignPlatformStats {
  ctr: number;
  cpm: number;
}

function statsFromRows(rows: PerformanceRow[]): CampaignPlatformStats {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  };
}

async function getPlatformPeerBenchmark(
  platform: PlatformKey,
  excludeCampaignId: string
): Promise<{ avgCtr: number; avgCpm: number; peerCount: number }> {
  const allRows = await getDataSource().getAllRows();
  const platformRows = allRows.filter((r) => r.platform === platform && r.campaignId !== excludeCampaignId);

  const byCampaign = new Map<string, PerformanceRow[]>();
  for (const row of platformRows) {
    const list = byCampaign.get(row.campaignId);
    if (list) list.push(row);
    else byCampaign.set(row.campaignId, [row]);
  }

  const peerStats = [...byCampaign.values()].map(statsFromRows);
  const peerCount = peerStats.length;
  const avgCtr = peerCount > 0 ? peerStats.reduce((s, c) => s + c.ctr, 0) / peerCount : 0;
  const avgCpm = peerCount > 0 ? peerStats.reduce((s, c) => s + c.cpm, 0) / peerCount : 0;

  return { avgCtr, avgCpm, peerCount };
}

/**
 * "Moat" analysis: every finding is framed as a comparison, never a bare statement.
 * Two axes -- this campaign vs. peer campaigns on the same platform, and this platform vs.
 * the other platforms this same Campaign ID runs on (the cross-platform differentiator).
 * (Campaign-vs-its-own-history is covered by get_trend_analysis, not duplicated here.)
 */
export async function getComparativeAnalysis(campaignId: string): Promise<ComparativeAnalysisResult | null> {
  const performance = await getCampaignPerformance(campaignId);
  if (!performance) return null;

  const peerComparisons: PeerComparisonFinding[] = [];
  for (const platformSummary of performance.platforms) {
    const benchmark = await getPlatformPeerBenchmark(platformSummary.platform, campaignId);
    if (benchmark.peerCount === 0) continue;

    const ctrDiff = percentDiff(platformSummary.ctr, benchmark.avgCtr);
    peerComparisons.push({
      axis: "peer-campaigns",
      platform: platformSummary.platform,
      metric: "ctr",
      thisCampaignValue: platformSummary.ctr,
      peerAverage: Number(benchmark.avgCtr.toFixed(2)),
      peerCount: benchmark.peerCount,
      percentDifference: ctrDiff,
      isBetterThanPeers: ctrDiff > 0,
      description: `${platformSummary.platform} CTR: this campaign ${platformSummary.ctr.toFixed(2)}% vs. ${benchmark.peerCount} peer campaign(s) averaging ${benchmark.avgCtr.toFixed(2)}% (${ctrDiff >= 0 ? "+" : ""}${ctrDiff.toFixed(0)}%).`,
    });

    const cpmDiff = percentDiff(platformSummary.cpm, benchmark.avgCpm);
    peerComparisons.push({
      axis: "peer-campaigns",
      platform: platformSummary.platform,
      metric: "cpm",
      thisCampaignValue: platformSummary.cpm,
      peerAverage: Number(benchmark.avgCpm.toFixed(2)),
      peerCount: benchmark.peerCount,
      percentDifference: cpmDiff,
      isBetterThanPeers: cpmDiff < 0, // lower CPM is better
      description: `${platformSummary.platform} CPM: this campaign $${platformSummary.cpm.toFixed(2)} vs. ${benchmark.peerCount} peer campaign(s) averaging $${benchmark.avgCpm.toFixed(2)} (${cpmDiff >= 0 ? "+" : ""}${cpmDiff.toFixed(0)}%, ${cpmDiff < 0 ? "cheaper" : "more expensive"}).`,
    });
  }

  const crossPlatformComparisons: CrossPlatformComparisonFinding[] = [];
  if (performance.platforms.length > 1) {
    for (const platformSummary of performance.platforms) {
      const others = performance.platforms.filter((p) => p.platform !== platformSummary.platform);
      const othersImpressions = others.reduce((s, p) => s + p.impressions, 0);
      const othersClicks = others.reduce((s, p) => s + p.clicks, 0);
      const othersSpend = others.reduce((s, p) => s + p.spend, 0);
      const othersCtr = othersImpressions > 0 ? (othersClicks / othersImpressions) * 100 : 0;
      const othersCpm = othersImpressions > 0 ? (othersSpend / othersImpressions) * 1000 : 0;

      const ctrDiff = percentDiff(platformSummary.ctr, othersCtr);
      const cpmDiff = percentDiff(platformSummary.cpm, othersCpm);
      const otherNames = others.map((o) => o.platform).join(", ");

      crossPlatformComparisons.push({
        axis: "cross-platform",
        platform: platformSummary.platform,
        otherPlatforms: others.map((o) => o.platform),
        ctrValue: platformSummary.ctr,
        ctrOthersAverage: Number(othersCtr.toFixed(2)),
        ctrPercentDifference: ctrDiff,
        cpmValue: platformSummary.cpm,
        cpmOthersAverage: Number(othersCpm.toFixed(2)),
        cpmPercentDifference: cpmDiff,
        description: `${platformSummary.platform} vs. the rest of this campaign (${otherNames}): CTR ${platformSummary.ctr.toFixed(2)}% vs. ${othersCtr.toFixed(2)}% (${ctrDiff >= 0 ? "+" : ""}${ctrDiff.toFixed(0)}%), CPM $${platformSummary.cpm.toFixed(2)} vs. $${othersCpm.toFixed(2)} (${cpmDiff >= 0 ? "+" : ""}${cpmDiff.toFixed(0)}%).`,
      });
    }
  }

  return { campaignId, peerComparisons, crossPlatformComparisons };
}
