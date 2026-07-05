import { getCampaignPerformance } from "./campaign-service";
import { collapseToDailySeries, DailyMetrics } from "./performance-analysis-utils";
import { PlatformKey } from "./platforms";

export type CreativeType = "video" | "static";

export interface FatigueFinding {
  platform: PlatformKey;
  creativeType: CreativeType;
  /** Whether Frequency was available/elevated enough to factor into this finding. */
  frequencySignal: "climbing-fast" | "elevated" | "none" | "unavailable";
  frequencyStart: number | null;
  frequencyEnd: number | null;
  engagementMetric: "ctr" | "video_engagement_rate";
  engagementStart: number;
  engagementEnd: number;
  engagementDropPct: number;
  cpmRising: boolean;
  windowStartDate: string;
  windowEndDate: string;
  /** Highest-confidence when engagement decline coincides with elevated/climbing Frequency. */
  confidence: "high" | "medium";
  summary: string;
  recommendations: string[];
}

export interface CreativeFatigueResult {
  campaignId: string;
  findings: FatigueFinding[];
}

const FATIGUE_WINDOW = 7;
const MIN_CONSECUTIVE_DAYS = 5;
const CUMULATIVE_DROP_THRESHOLD = 0.25;

/** A platform-campaign is treated as "video" creative when video metric is meaningfully non-zero relative to impressions. */
function classifyCreativeType(series: DailyMetrics[]): CreativeType {
  const recentDays = series.slice(-14);
  const totalImpressions = recentDays.reduce((s, d) => s + d.impressions, 0);
  const totalVideoMetric = recentDays.reduce((s, d) => s + d.videoMetric, 0);
  const rate = totalImpressions > 0 ? totalVideoMetric / totalImpressions : 0;
  return rate > 0.03 ? "video" : "static";
}

/** Finds the longest run, ending on the last day, of >= minDays consecutive declines meeting the cumulative drop threshold. */
function findDeclineWindow(
  values: number[],
  minDays: number,
  maxWindow: number
): { startIdx: number; endIdx: number; dropPct: number } | null {
  const n = values.length;
  for (let window = maxWindow; window >= minDays; window--) {
    const startIdx = n - window;
    if (startIdx < 0) continue;
    const startVal = values[startIdx];
    const endVal = values[n - 1];
    if (startVal <= 0) continue;
    const dropPct = (startVal - endVal) / startVal;
    if (dropPct > CUMULATIVE_DROP_THRESHOLD) {
      return { startIdx, endIdx: n - 1, dropPct };
    }
  }
  return null;
}

function frequencySignalFor(frequency: (number | null)[]): {
  signal: "climbing-fast" | "elevated" | "none" | "unavailable";
  start: number | null;
  end: number | null;
} {
  const window = frequency.slice(-FATIGUE_WINDOW);
  if (window.some((f) => f === null)) {
    // Best-effort: if Frequency isn't populated for this platform, don't block fatigue detection.
    const populated = window.filter((f): f is number => f !== null);
    if (populated.length === 0) return { signal: "unavailable", start: null, end: null };
  }
  const populated = window.filter((f): f is number => f !== null);
  if (populated.length === 0) return { signal: "unavailable", start: null, end: null };

  const start = populated[0];
  const end = populated[populated.length - 1];
  const fastClimb = populated.length >= 5 && end - populated[Math.max(0, populated.length - 5)] > 0.5;

  if (end > 3.5 && fastClimb) return { signal: "climbing-fast", start, end };
  if (end > 3) return { signal: "elevated", start, end };
  return { signal: "none", start, end };
}

function buildRecommendations(
  platform: PlatformKey,
  frequencySignal: "climbing-fast" | "elevated" | "none" | "unavailable",
  frequencyEnd: number | null,
  engagementMetric: "ctr" | "video_engagement_rate",
  engagementDropPct: number,
  cpmRising: boolean
): string[] {
  const recs: string[] = [];
  const freqIsHigh = frequencySignal === "climbing-fast" || frequencySignal === "elevated";
  const metricLabel = engagementMetric === "ctr" ? "CTR" : "video engagement rate";

  if (freqIsHigh && frequencyEnd !== null) {
    recs.push(
      `Frequency is ${frequencySignal === "climbing-fast" ? "climbing fast" : "elevated"} on ${platform} ` +
        `(now ${frequencyEnd.toFixed(1)}) -- expand the audience (see suggest_audience_expansion) or pause/reduce ` +
        `daily budget on this ad set so delivery slows down. Fresh creative into an already-saturated ` +
        `audience will fatigue again quickly, so don't rely on a creative refresh alone.`
    );
  } else {
    recs.push(
      `Frequency isn't the driver here -- this looks like creative wear-out, not audience saturation. ` +
        `Refresh creative on ${platform} specifically: test new hook variations (first 3 seconds for video, ` +
        `headline/first visual for static), and check whether the current set is a single-angle batch ` +
        `(one emotional trigger, one format) vs. genuinely diverse (mix of static, carousel, and video, ` +
        `multiple angles) -- diversify format and angle rather than producing near-identical variations.`
    );
  }

  if (freqIsHigh && engagementDropPct > 0) {
    recs.push(
      `Both signals are present (Frequency ${frequencySignal.replace("-", " ")} and ${metricLabel} down ` +
        `${(engagementDropPct * 100).toFixed(0)}%) -- do both: reduce delivery pressure AND refresh creative. ` +
        `Creative refresh alone likely won't hold if the underlying audience is still small and saturated.`
    );
  }

  if (cpmRising) {
    recs.push(
      `CPM is climbing over the same window as the ${metricLabel} decline on ${platform} -- a stronger ` +
        `fatigue signal than either metric alone (the auction is charging more for shrinking attention).`
    );
  }

  return recs;
}

/** Live campaigns only: creative fatigue via Frequency saturation + video-engagement-rate or CTR decline. */
export async function detectCreativeFatigue(campaignId: string): Promise<CreativeFatigueResult | null> {
  const performance = await getCampaignPerformance(campaignId);
  if (!performance) return null;

  const findings: FatigueFinding[] = [];

  for (const [platformKey, rows] of Object.entries(performance.rowsByPlatform)) {
    if (!rows) continue;
    const platform = platformKey as PlatformKey;
    const series = collapseToDailySeries(rows);
    if (series.length < MIN_CONSECUTIVE_DAYS) continue;

    const creativeType = classifyCreativeType(series);
    const { signal: frequencySignal, start: frequencyStart, end: frequencyEnd } = frequencySignalFor(
      series.map((d) => d.frequency)
    );

    let engagementMetric: "ctr" | "video_engagement_rate";
    let engagementValues: number[];

    if (creativeType === "video") {
      engagementMetric = "video_engagement_rate";
      engagementValues = series.map((d) => (d.impressions > 0 ? d.videoMetric / d.impressions : 0));
    } else {
      engagementMetric = "ctr";
      engagementValues = series.map((d) => d.ctr);
    }

    const decline = findDeclineWindow(engagementValues, MIN_CONSECUTIVE_DAYS, FATIGUE_WINDOW + 1);
    if (!decline) continue;

    const cpm = series.map((d) => d.cpm);
    const cpmRising = cpm[decline.endIdx] > cpm[decline.startIdx] * 1.05;

    const freqIsHigh = frequencySignal === "climbing-fast" || frequencySignal === "elevated";
    const confidence: "high" | "medium" = freqIsHigh ? "high" : "medium";

    const engagementStart = engagementValues[decline.startIdx];
    const engagementEnd = engagementValues[decline.endIdx];
    const metricLabel = engagementMetric === "ctr" ? "CTR" : "video engagement rate";
    const windowDays = decline.endIdx - decline.startIdx + 1;

    // For video creative, a simultaneous CTR decline over the same window is corroborating
    // evidence (not the primary signal -- CTR is the primary signal for static/carousel).
    const ctrAlsoDeclining =
      engagementMetric === "video_engagement_rate" &&
      series[decline.startIdx].ctr > 0 &&
      (series[decline.startIdx].ctr - series[decline.endIdx].ctr) / series[decline.startIdx].ctr > 0.1;

    let summary: string;
    if (freqIsHigh && frequencyStart !== null && frequencyEnd !== null) {
      summary =
        `${platform}: ${metricLabel} down ${(decline.dropPct * 100).toFixed(0)}% while Frequency climbed ` +
        `from ${frequencyStart.toFixed(1)} to ${frequencyEnd.toFixed(1)} over the same ${windowDays} days -- ` +
        `this looks like audience saturation, not a market or seasonality shift.`;
    } else {
      summary =
        `${platform}: ${metricLabel} down ${(decline.dropPct * 100).toFixed(0)}% over ${windowDays} days ` +
        `with Frequency ${frequencySignal === "unavailable" ? "unavailable" : "not elevated"} -- likely creative wear-out.`;
    }
    if (ctrAlsoDeclining) {
      const ctrDropPct = ((series[decline.startIdx].ctr - series[decline.endIdx].ctr) / series[decline.startIdx].ctr) * 100;
      summary += ` CTR fell ${ctrDropPct.toFixed(0)}% over the same window -- corroborates a real fatigue effect, not just a video-counting quirk.`;
    }

    findings.push({
      platform,
      creativeType,
      frequencySignal,
      frequencyStart,
      frequencyEnd,
      engagementMetric,
      engagementStart: Number(engagementStart.toFixed(4)),
      engagementEnd: Number(engagementEnd.toFixed(4)),
      engagementDropPct: Number((decline.dropPct * 100).toFixed(1)),
      cpmRising,
      windowStartDate: series[decline.startIdx].date,
      windowEndDate: series[decline.endIdx].date,
      confidence,
      summary,
      recommendations: buildRecommendations(
        platform,
        frequencySignal,
        frequencyEnd,
        engagementMetric,
        decline.dropPct,
        cpmRising
      ),
    });
  }

  return { campaignId, findings };
}
