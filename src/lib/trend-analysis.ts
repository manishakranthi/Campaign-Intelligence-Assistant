import { getCampaignPerformance } from "./campaign-service";
import { addDays, formatDate, MOCK_TODAY } from "./mock-data/mock-clock";
import { collapseToDailySeries, DailyMetrics } from "./performance-analysis-utils";
import { PlatformKey } from "./platforms";

export interface DateRange {
  start: string;
  end: string;
}

export interface MetricComparison {
  metric: string;
  prior: number;
  current: number;
  percentChange: number | null;
  direction: "up" | "down" | "flat";
  /** Same magnitude bar as anomaly detection uses -- a 3% move isn't worth calling out. */
  isMeaningful: boolean;
}

export interface PlatformTrend {
  platform: PlatformKey;
  metrics: MetricComparison[];
}

export interface TrendAnalysisResult {
  campaignId: string;
  priorPeriod: DateRange;
  currentPeriod: DateRange;
  combined: MetricComparison[];
  byPlatform: PlatformTrend[];
}

export interface TrendAnalysisPeriod {
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
}

const MEANINGFUL_THRESHOLD_PCT = 15;

function buildComparison(metric: string, prior: number, current: number): MetricComparison {
  const pct = prior === 0 ? (current === 0 ? 0 : null) : Number((((current - prior) / prior) * 100).toFixed(1));
  const direction: "up" | "down" | "flat" =
    pct === null ? (current > 0 ? "up" : "flat") : pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  return {
    metric,
    prior: Number(prior.toFixed(3)),
    current: Number(current.toFixed(3)),
    percentChange: pct,
    direction,
    isMeaningful: pct !== null && Math.abs(pct) >= MEANINGFUL_THRESHOLD_PCT,
  };
}

function sliceByDateRange(series: DailyMetrics[], range: DateRange): DailyMetrics[] {
  return series.filter((d) => d.date >= range.start && d.date <= range.end);
}

function aggregate(days: DailyMetrics[]) {
  const spend = days.reduce((s, d) => s + d.spend, 0);
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const videoMetric = days.reduce((s, d) => s + d.videoMetric, 0);
  const withFrequency = days.filter((d) => d.frequency !== null);
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    frequency:
      withFrequency.length > 0
        ? withFrequency.reduce((s, d) => s + (d.frequency ?? 0), 0) / withFrequency.length
        : null,
    videoMetric,
  };
}

/**
 * Period-over-period comparison: this campaign vs. itself over time (distinct from the "moat"
 * comparative analysis, which compares against peers/other platforms). Defaults to trailing 7
 * days vs. the 7 days before that; pass `period` for any other range Claude has parsed from the
 * user's request (e.g. "this month vs last month").
 */
export async function getTrendAnalysis(
  campaignId: string,
  period?: TrendAnalysisPeriod
): Promise<TrendAnalysisResult | null> {
  const performance = await getCampaignPerformance(campaignId);
  if (!performance) return null;

  const currentPeriod: DateRange = period
    ? { start: period.currentStart, end: period.currentEnd }
    : { start: formatDate(addDays(MOCK_TODAY, -7)), end: formatDate(addDays(MOCK_TODAY, -1)) };
  const priorPeriod: DateRange = period
    ? { start: period.priorStart, end: period.priorEnd }
    : { start: formatDate(addDays(MOCK_TODAY, -14)), end: formatDate(addDays(MOCK_TODAY, -8)) };

  const byPlatform: PlatformTrend[] = [];
  const combinedCurrent = { spend: 0, impressions: 0, clicks: 0 };
  const combinedPrior = { spend: 0, impressions: 0, clicks: 0 };
  const combinedCurrentFreqs: number[] = [];
  const combinedPriorFreqs: number[] = [];

  for (const [platformKey, rows] of Object.entries(performance.rowsByPlatform)) {
    if (!rows) continue;
    const platform = platformKey as PlatformKey;
    const series = collapseToDailySeries(rows);

    const current = aggregate(sliceByDateRange(series, currentPeriod));
    const prior = aggregate(sliceByDateRange(series, priorPeriod));

    combinedCurrent.spend += current.spend;
    combinedCurrent.impressions += current.impressions;
    combinedCurrent.clicks += current.clicks;
    combinedPrior.spend += prior.spend;
    combinedPrior.impressions += prior.impressions;
    combinedPrior.clicks += prior.clicks;
    if (current.frequency !== null) combinedCurrentFreqs.push(current.frequency);
    if (prior.frequency !== null) combinedPriorFreqs.push(prior.frequency);

    const videoLabel = rows[0]?.videoMetricLabel ?? "Video Engagement";
    const hasFrequency = current.frequency !== null || prior.frequency !== null;

    byPlatform.push({
      platform,
      metrics: [
        buildComparison("Spend", prior.spend, current.spend),
        buildComparison("Impressions", prior.impressions, current.impressions),
        buildComparison("Clicks", prior.clicks, current.clicks),
        buildComparison("CTR (%)", prior.ctr, current.ctr),
        buildComparison("CPM ($)", prior.cpm, current.cpm),
        ...(hasFrequency ? [buildComparison("Frequency", prior.frequency ?? 0, current.frequency ?? 0)] : []),
        buildComparison(videoLabel, prior.videoMetric, current.videoMetric),
      ],
    });
  }

  const ctrCurrent = combinedCurrent.impressions > 0 ? (combinedCurrent.clicks / combinedCurrent.impressions) * 100 : 0;
  const ctrPrior = combinedPrior.impressions > 0 ? (combinedPrior.clicks / combinedPrior.impressions) * 100 : 0;
  const cpmCurrent = combinedCurrent.impressions > 0 ? (combinedCurrent.spend / combinedCurrent.impressions) * 1000 : 0;
  const cpmPrior = combinedPrior.impressions > 0 ? (combinedPrior.spend / combinedPrior.impressions) * 1000 : 0;
  const freqCurrent =
    combinedCurrentFreqs.length > 0
      ? combinedCurrentFreqs.reduce((s, v) => s + v, 0) / combinedCurrentFreqs.length
      : null;
  const freqPrior =
    combinedPriorFreqs.length > 0 ? combinedPriorFreqs.reduce((s, v) => s + v, 0) / combinedPriorFreqs.length : null;

  const combined: MetricComparison[] = [
    buildComparison("Spend", combinedPrior.spend, combinedCurrent.spend),
    buildComparison("Impressions", combinedPrior.impressions, combinedCurrent.impressions),
    buildComparison("Clicks", combinedPrior.clicks, combinedCurrent.clicks),
    buildComparison("CTR (%)", ctrPrior, ctrCurrent),
    buildComparison("CPM ($)", cpmPrior, cpmCurrent),
    ...(freqPrior !== null || freqCurrent !== null ? [buildComparison("Frequency", freqPrior ?? 0, freqCurrent ?? 0)] : []),
    // Video engagement metric intentionally omitted at the combined level -- counting
    // methodology differs per platform (3-Second Video Views vs. Thruplays vs. Video Views), so
    // summing it across platforms would be misleading. See byPlatform for each platform's own trend.
  ];

  return { campaignId, priorPeriod, currentPeriod, combined, byPlatform };
}
