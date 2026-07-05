import { PerformanceRow } from "./data-source";

export interface DailyMetrics {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  frequency: number | null;
  videoMetric: number;
  videoMetricLabel: string;
  /** This platform's allocated daily budget cap for the campaign (summed across placement rows, e.g. FB+IG). */
  budget: number;
}

/**
 * Collapses a single platform's raw rows into one row per day. Needed because Meta's tab has
 * separate FB and IG placement rows per day for the same Campaign ID -- every downstream
 * analysis tool operates on "this platform's daily performance," not individual placement rows.
 */
export function collapseToDailySeries(rows: PerformanceRow[]): DailyMetrics[] {
  const byDate = new Map<string, PerformanceRow[]>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (existing) existing.push(row);
    else byDate.set(row.date, [row]);
  }

  return [...byDate.entries()]
    .map(([date, dayRows]) => {
      const spend = dayRows.reduce((s, r) => s + r.spend, 0);
      const impressions = dayRows.reduce((s, r) => s + r.impressions, 0);
      const clicks = dayRows.reduce((s, r) => s + r.clicks, 0);
      const videoMetric = dayRows.reduce((s, r) => s + r.videoMetric, 0);
      const budget = dayRows.reduce((s, r) => s + r.budget, 0);
      const withFrequency = dayRows.filter((r) => r.frequency !== null);

      return {
        date,
        spend: Number(spend.toFixed(2)),
        impressions,
        clicks,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(3)) : 0,
        cpm: impressions > 0 ? Number(((spend / impressions) * 1000).toFixed(3)) : 0,
        frequency:
          withFrequency.length > 0
            ? Number((withFrequency.reduce((s, r) => s + (r.frequency ?? 0), 0) / withFrequency.length).toFixed(3))
            : null,
        videoMetric,
        videoMetricLabel: dayRows[0]?.videoMetricLabel ?? "",
        budget: Number(budget.toFixed(2)),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Average of the `window` values ending just before (not including) `endExclusiveIndex`. */
export function trailingAverage(values: number[], endExclusiveIndex: number, window: number): number {
  const start = Math.max(0, endExclusiveIndex - window);
  return average(values.slice(start, endExclusiveIndex));
}

/** Returns null when `prior` is 0, since percent change from a zero base is undefined. */
export function percentChange(prior: number, current: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return Number((((current - prior) / prior) * 100).toFixed(1));
}

/** Finds runs of `true` values in `flags` that are at least `minLength` long, as [startIdx, endIdx] pairs. */
export function findSustainedRuns(flags: boolean[], minLength: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start: number | null = null;
  for (let i = 0; i <= flags.length; i++) {
    const flagged = i < flags.length && flags[i];
    if (flagged) {
      if (start === null) start = i;
    } else if (start !== null) {
      if (i - start >= minLength) runs.push([start, i - 1]);
      start = null;
    }
  }
  return runs;
}
