import { getCampaignPerformance } from "./campaign-service";
import { daysBetween, parseDate } from "./mock-data/mock-clock";
import { collapseToDailySeries, DailyMetrics, findSustainedRuns, trailingAverage } from "./performance-analysis-utils";
import { PlatformKey } from "./platforms";

export type AnomalyType = "overspend" | "underspend" | "cpm-spike" | "ctr-drop";

export interface AnomalyFinding {
  type: AnomalyType;
  platform: PlatformKey;
  startDate: string;
  endDate: string;
  days: number;
  values: number[];
  benchmark: number;
  description: string;
}

export interface CrossPlatformAnomalyFinding {
  type: "cross-platform-correlated";
  primary: AnomalyFinding;
  linked: AnomalyFinding;
  daysBetween: number;
  description: string;
}

export interface AnomalyDetectionResult {
  campaignId: string;
  /** Findings not linked to a correlated shift on another platform. */
  findings: AnomalyFinding[];
  /** Findings on two different platforms within 1-5 days of each other -- the cross-platform-only insight. */
  crossPlatformFindings: CrossPlatformAnomalyFinding[];
}

const MIN_HISTORY = 7;

function detectForPlatform(platform: PlatformKey, series: DailyMetrics[]): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];
  const spend = series.map((d) => d.spend);
  const cpm = series.map((d) => d.cpm);
  const ctr = series.map((d) => d.ctr);
  // This platform's own allocated daily budget cap (the sheet's Budget column) -- NOT the
  // ticket's combined Overall Budget, which spans every platform and would make any single
  // platform's spend look like permanent underspend by comparison.
  const budget = series.map((d) => d.budget);

  const overspendFlags = spend.map((v, i) => {
    if (i < MIN_HISTORY) return false;
    const trailing = trailingAverage(spend, i, 7);
    return v > trailing * 1.3 || v > budget[i] * 1.3;
  });
  for (const [s, e] of findSustainedRuns(overspendFlags, 2)) {
    const trailing = trailingAverage(spend, s, 7);
    const pctOver = trailing > 0 ? (((spend[e] - trailing) / trailing) * 100).toFixed(0) : "n/a";
    findings.push({
      type: "overspend",
      platform,
      startDate: series[s].date,
      endDate: series[e].date,
      days: e - s + 1,
      values: spend.slice(s, e + 1),
      benchmark: Number(trailing.toFixed(2)),
      description: `${platform} spend ran ${pctOver}% above its trailing 7-day average ($${trailing.toFixed(0)}/day) for ${e - s + 1} days (${series[s].date} to ${series[e].date}).`,
    });
  }

  const underspendFlags = spend.map((v, i) => {
    if (i < MIN_HISTORY) return false;
    const trailing = trailingAverage(spend, i, 7);
    return v < trailing * 0.5 || v < budget[i] * 0.5;
  });
  for (const [s, e] of findSustainedRuns(underspendFlags, 2)) {
    const trailing = trailingAverage(spend, s, 7);
    const pctOf = trailing > 0 ? ((spend[e] / trailing) * 100).toFixed(0) : "n/a";
    findings.push({
      type: "underspend",
      platform,
      startDate: series[s].date,
      endDate: series[e].date,
      days: e - s + 1,
      values: spend.slice(s, e + 1),
      benchmark: Number(trailing.toFixed(2)),
      description: `${platform} spend dropped to ${pctOf}% of its trailing 7-day average ($${trailing.toFixed(0)}/day) for ${e - s + 1} days (${series[s].date} to ${series[e].date}) -- pacing risk.`,
    });
  }

  const cpmFlags = cpm.map((v, i) => (i < MIN_HISTORY ? false : v > trailingAverage(cpm, i, 7) * 1.3));
  for (const [s, e] of findSustainedRuns(cpmFlags, 2)) {
    const trailing = trailingAverage(cpm, s, 7);
    const pctOver = trailing > 0 ? (((cpm[e] - trailing) / trailing) * 100).toFixed(0) : "n/a";
    findings.push({
      type: "cpm-spike",
      platform,
      startDate: series[s].date,
      endDate: series[e].date,
      days: e - s + 1,
      values: cpm.slice(s, e + 1),
      benchmark: Number(trailing.toFixed(2)),
      description: `${platform} CPM rose to $${cpm[e].toFixed(2)}, ${pctOver}% above its trailing 7-day average ($${trailing.toFixed(2)}) for ${e - s + 1} days.`,
    });
  }

  const ctrFlags = ctr.map((v, i) => (i < MIN_HISTORY ? false : v < trailingAverage(ctr, i, 7) * 0.7));
  for (const [s, e] of findSustainedRuns(ctrFlags, 3)) {
    const trailing = trailingAverage(ctr, s, 7);
    const pctUnder = trailing > 0 ? (((trailing - ctr[e]) / trailing) * 100).toFixed(0) : "n/a";
    findings.push({
      type: "ctr-drop",
      platform,
      startDate: series[s].date,
      endDate: series[e].date,
      days: e - s + 1,
      values: ctr.slice(s, e + 1),
      benchmark: Number(trailing.toFixed(3)),
      description: `${platform} CTR fell to ${ctr[e].toFixed(2)}%, ${pctUnder}% below its trailing 7-day average (${trailing.toFixed(2)}%) for ${e - s + 1} days.`,
    });
  }

  return findings;
}

/** Live campaigns only: anomalies based on spend/CPM/CTR vs. each campaign's own trailing 7-day average. */
export async function detectAnomalies(campaignId: string): Promise<AnomalyDetectionResult | null> {
  const performance = await getCampaignPerformance(campaignId);
  if (!performance) return null;

  const allFindings: AnomalyFinding[] = [];
  for (const [platform, rows] of Object.entries(performance.rowsByPlatform)) {
    if (!rows) continue;
    const series = collapseToDailySeries(rows);
    allFindings.push(...detectForPlatform(platform as PlatformKey, series));
  }

  // Cross-platform correlation: a finding on one platform followed 1-5 days later by a finding
  // on a different platform for the same Campaign ID gets merged into one linked finding.
  const used = new Set<number>();
  const crossPlatformFindings: CrossPlatformAnomalyFinding[] = [];

  for (let i = 0; i < allFindings.length; i++) {
    if (used.has(i)) continue;
    for (let j = 0; j < allFindings.length; j++) {
      if (i === j || used.has(j)) continue;
      const a = allFindings[i];
      const b = allFindings[j];
      if (a.platform === b.platform) continue;

      const gap = daysBetween(parseDate(a.endDate), parseDate(b.startDate));
      if (gap >= 1 && gap <= 5) {
        crossPlatformFindings.push({
          type: "cross-platform-correlated",
          primary: a,
          linked: b,
          daysBetween: gap,
          description:
            `Cross-platform signal: ${a.platform}'s ${a.type} (${a.startDate} to ${a.endDate}) was followed ` +
            `${gap} day(s) later by ${b.platform}'s ${b.type} (${b.startDate} to ${b.endDate}) on the same ` +
            `Campaign ID -- likely related, not a coincidence.`,
        });
        used.add(i);
        used.add(j);
        break;
      }
    }
  }

  const findings = allFindings.filter((_, idx) => !used.has(idx));

  return { campaignId, findings, crossPlatformFindings };
}
