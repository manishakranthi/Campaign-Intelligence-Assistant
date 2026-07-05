import { parseCampaignName } from "../parse-campaign-name";
import { PLATFORM_PREFIXES, PlatformKey, VIDEO_METRIC_LABEL } from "../platforms";
import { addDays, daysBetween, formatDate, MOCK_TODAY, parseDate } from "./mock-clock";
import { randomInRange, seededRandom } from "../seeded-random";
import { RawTicket, TICKETS_DATA } from "./tickets";

export interface PerformanceRow {
  date: string;
  platform: PlatformKey;
  campaignId: string;
  campaignNameSegment: string;
  goalTypeCode: string | null;
  rawCampaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  frequency: number | null;
  budget: number;
  videoMetric: number;
  videoMetricLabel: string;
  startDate: string;
  endDate: string;
}

interface PlatformBaseline {
  cpmRange: [number, number];
  ctrRange: [number, number];
  /** Whether Frequency is reliably reported on this platform (Meta) or best-effort (everyone else). */
  frequencyReliable: boolean;
}

const PLATFORM_BASELINES: Record<PlatformKey, PlatformBaseline> = {
  META: { cpmRange: [8, 16], ctrRange: [0.8, 1.8], frequencyReliable: true },
  LINKEDIN: { cpmRange: [28, 55], ctrRange: [0.4, 0.9], frequencyReliable: false },
  GOOGLE: { cpmRange: [10, 24], ctrRange: [1.0, 2.6], frequencyReliable: false },
  TABOOLA: { cpmRange: [4, 9], ctrRange: [0.25, 0.55], frequencyReliable: false },
  STACKADAPT: { cpmRange: [6, 12], ctrRange: [0.3, 0.65], frequencyReliable: false },
};

/**
 * Seeded anomaly/fatigue scenarios, one of each type called for in the build spec, applied as
 * overrides on top of the baseline series so detection tools have guaranteed material to find.
 * Day indices are negative offsets from the last generated day (index N-1 = yesterday, since
 * we don't generate a row for "today" -- daily reporting always lags by a day).
 */
type ScenarioKind =
  | "overspend"
  | "underspend"
  | "video-fatigue"
  | "static-fatigue"
  | "cross-platform-linkedin-cut"
  | "cross-platform-meta-echo";

interface SeededScenario {
  campaignId: string;
  platform: PlatformKey;
  kind: ScenarioKind;
}

export const SEEDED_SCENARIOS: SeededScenario[] = [
  { campaignId: "10102", platform: "GOOGLE", kind: "overspend" },
  { campaignId: "10108", platform: "TABOOLA", kind: "underspend" },
  { campaignId: "10104", platform: "META", kind: "video-fatigue" },
  { campaignId: "10112", platform: "STACKADAPT", kind: "static-fatigue" },
  { campaignId: "10109", platform: "LINKEDIN", kind: "cross-platform-linkedin-cut" },
  { campaignId: "10109", platform: "META", kind: "cross-platform-meta-echo" },
];

function scenarioFor(campaignId: string, platform: PlatformKey): ScenarioKind | null {
  const match = SEEDED_SCENARIOS.find(
    (s) => s.campaignId === campaignId && s.platform === platform
  );
  return match?.kind ?? null;
}

interface DailySeries {
  spend: number[];
  cpm: number[];
  ctr: number[];
  frequency: (number | null)[];
  videoViewRate: number[];
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function trailingAvg(values: number[], endExclusive: number, window: number): number {
  const start = Math.max(0, endExclusive - window);
  const slice = values.slice(start, endExclusive);
  return slice.length ? average(slice) : values[0];
}

/** Builds the un-overridden baseline series for one campaign/platform pair across N days. */
function buildBaselineSeries(
  n: number,
  dailyPace: number,
  baseline: PlatformBaseline,
  isVideoHeavy: boolean,
  frequencyPopulated: boolean,
  rng: () => number
): DailySeries {
  const baseCpm = randomInRange(rng, baseline.cpmRange[0], baseline.cpmRange[1]);
  const baseCtr = randomInRange(rng, baseline.ctrRange[0], baseline.ctrRange[1]);
  const baseVideoViewRate = isVideoHeavy
    ? randomInRange(rng, 0.12, 0.32)
    : randomInRange(rng, 0, 0.01);

  let freq = randomInRange(rng, 1.2, 1.8);
  const freqDriftPerDay = randomInRange(rng, 0.01, 0.03);

  const spend: number[] = [];
  const cpm: number[] = [];
  const ctr: number[] = [];
  const frequency: (number | null)[] = [];
  const videoViewRate: number[] = [];

  for (let day = 0; day < n; day++) {
    // Kept tight (+/-10%) so ordinary day-to-day noise never crosses the anomaly-detection
    // thresholds (130%/50% of a 7-day trailing average) by chance -- only the seeded overrides
    // below should ever trigger detect_anomalies.
    spend.push(dailyPace * randomInRange(rng, 0.9, 1.1));
    cpm.push(baseCpm * randomInRange(rng, 0.9, 1.1));
    ctr.push(baseCtr * randomInRange(rng, 0.88, 1.12));
    videoViewRate.push(Math.max(0, baseVideoViewRate * randomInRange(rng, 0.85, 1.15)));

    freq = freq + freqDriftPerDay * randomInRange(rng, 0.5, 1.5);
    frequency.push(frequencyPopulated ? Number(freq.toFixed(2)) : null);
  }

  return { spend, cpm, ctr, frequency, videoViewRate };
}

/** Overwrites the last `window` entries of `values` with a linear ramp from startVal to endVal. */
function applyRamp(values: number[], window: number, startVal: number, endVal: number): void {
  const n = values.length;
  for (let i = 0; i < window; i++) {
    const idx = n - window + i;
    const t = window === 1 ? 1 : i / (window - 1);
    values[idx] = startVal + (endVal - startVal) * t;
  }
}

function applySustainedMultiplier(
  values: number[],
  window: number,
  multiplier: number,
  referenceWindow: number
): void {
  const n = values.length;
  const refEnd = n - window;
  const ref = trailingAvg(values, refEnd, referenceWindow);
  for (let i = n - window; i < n; i++) {
    values[i] = ref * multiplier;
  }
}

/** Applies the hand-authored anomaly/fatigue override for a scenario onto an otherwise-baseline series. */
function applyScenario(series: DailySeries, kind: ScenarioKind): void {
  const n = series.spend.length;

  switch (kind) {
    case "overspend": {
      // Sustained 2+ days at >130% of the trailing 7-day average spend.
      applySustainedMultiplier(series.spend, 2, 2.2, 7);
      break;
    }
    case "underspend": {
      // Sustained 2+ days at <50% of the trailing 7-day average spend.
      applySustainedMultiplier(series.spend, 2, 0.35, 7);
      break;
    }
    case "video-fatigue": {
      // Frequency climbs fast (2.1 -> 4.6) over 8 days while video engagement rate and CTR
      // decline together over the same window -- the strongest-confidence combined signal.
      const window = 8;
      applyRamp(series.frequency as number[], window, 2.1, 4.6);
      const declineWindow = 6;
      const refVideoRate = trailingAvg(series.videoViewRate, n - declineWindow, 7);
      const refCtr = trailingAvg(series.ctr, n - declineWindow, 7);
      applyRamp(series.videoViewRate, declineWindow, refVideoRate, refVideoRate * 0.7);
      applyRamp(series.ctr, declineWindow, refCtr, refCtr * 0.72);
      break;
    }
    case "static-fatigue": {
      // CTR declines >25% cumulatively over 7 days while Frequency is elevated/climbing and
      // CPM climbs over the same window -- static/carousel creative wear-out.
      const window = 7;
      const refCtr = trailingAvg(series.ctr, n - window, 7);
      const refCpm = trailingAvg(series.cpm, n - window, 7);
      applyRamp(series.ctr, window, refCtr, refCtr * 0.7);
      applyRamp(series.frequency as number[], window, 3.2, 4.0);
      applyRamp(series.cpm, window, refCpm, refCpm * 1.22);
      break;
    }
    case "cross-platform-linkedin-cut": {
      // LinkedIn spend cut, sustained 2 days, starting 9 days ago.
      const cutStart = n - 9;
      const ref = trailingAvg(series.spend, cutStart, 7);
      for (let i = cutStart; i < cutStart + 2 && i < n; i++) {
        series.spend[i] = ref * 0.32;
      }
      break;
    }
    case "cross-platform-meta-echo": {
      // Meta CTR dips starting 2 days after the LinkedIn cut ends (within the 1-5 day
      // correlation window), sustained 3 days -- the cross-platform-only linked finding.
      // Held well below the 70%-of-trailing-avg threshold (not just under it) because the
      // detector's trailing average itself erodes downward as each dipped day joins the
      // window -- a dip that only just clears the threshold on day 1 can fall short by day 3.
      const dipStart = n - 6;
      const ref = trailingAvg(series.ctr, dipStart, 7);
      for (let i = dipStart; i < dipStart + 3 && i < n; i++) {
        series.ctr[i] = ref * 0.5;
      }
      break;
    }
  }
}

function buildRow(params: {
  date: string;
  platform: PlatformKey;
  prefix: string;
  ticket: RawTicket;
  spend: number;
  cpm: number;
  ctr: number;
  frequency: number | null;
  videoViewRate: number;
  dailyBudgetCap: number;
}): PerformanceRow {
  const { date, platform, prefix, ticket, spend, cpm, ctr, frequency, videoViewRate, dailyBudgetCap } =
    params;

  const rawCampaignName = `${prefix}_${ticket.campaignId}_${ticket.campaignName}_${ticket.goalTypeCode}`;
  const parsed = parseCampaignName(rawCampaignName);

  const impressions = Math.round((spend / cpm) * 1000);
  const clicks = Math.round(impressions * (ctr / 100));
  const videoMetric = Math.round(impressions * videoViewRate);

  return {
    date,
    platform,
    campaignId: parsed.campaignId,
    campaignNameSegment: parsed.campaignName,
    goalTypeCode: parsed.goalType,
    rawCampaignName,
    spend: Number(spend.toFixed(2)),
    impressions,
    clicks,
    ctr: Number(ctr.toFixed(2)),
    cpm: Number(cpm.toFixed(2)),
    frequency: frequency !== null ? Number(frequency.toFixed(2)) : null,
    budget: Number(dailyBudgetCap.toFixed(2)),
    videoMetric,
    videoMetricLabel: VIDEO_METRIC_LABEL[platform],
    startDate: ticket.flightStartDate,
    endDate: ticket.flightEndDate,
  };
}

function generateForCampaignPlatform(ticket: RawTicket, platform: PlatformKey): PerformanceRow[] {
  const campaignId = String(ticket.campaignId);
  const flightStart = parseDate(ticket.flightStartDate);
  const flightLengthDays = daysBetween(flightStart, parseDate(ticket.flightEndDate)) + 1;

  // Data is only generated through "yesterday" -- daily platform reporting always lags a day.
  const elapsedDays = Math.min(daysBetween(flightStart, MOCK_TODAY), flightLengthDays);
  if (elapsedDays <= 0) return [];

  const rng = seededRandom(`${campaignId}:${platform}`);
  const platformWeight = randomInRange(rng, 0.6, 1.4);
  const totalWeight = ticket.platforms.reduce(
    (sum, p) => sum + randomInRange(seededRandom(`${campaignId}:${p}`), 0.6, 1.4),
    0
  );
  const platformBudget = ticket.overallBudget * (platformWeight / totalWeight);
  const dailyPace = platformBudget / flightLengthDays;
  const dailyBudgetCap = Math.round(dailyPace);

  const baseline = PLATFORM_BASELINES[platform];
  const scenario = scenarioFor(campaignId, platform);

  // Forced creative type / frequency availability for the seeded fatigue scenarios so the
  // demo's detection tools have guaranteed, unambiguous material.
  const isVideoHeavy =
    scenario === "video-fatigue" ? true : scenario === "static-fatigue" ? false : rng() > 0.5;
  const frequencyPopulated =
    scenario === "static-fatigue" || scenario === "video-fatigue" || baseline.frequencyReliable
      ? true
      : rng() > 0.3;

  const series = buildBaselineSeries(
    elapsedDays,
    dailyPace,
    baseline,
    isVideoHeavy,
    frequencyPopulated,
    rng
  );

  if (scenario) applyScenario(series, scenario);

  const rows: PerformanceRow[] = [];
  const prefixes = PLATFORM_PREFIXES[platform];

  for (let day = 0; day < elapsedDays; day++) {
    const date = formatDate(addDays(flightStart, day));
    const frequency = series.frequency[day];
    const videoViewRate = series.videoViewRate[day];

    if (platform === "META") {
      // Meta's tab carries separate FB and IG placement rows for the same Campaign ID --
      // split the day's combined totals across both so the aggregation/join logic has to do
      // real work, not just read a single row per day.
      const fbShare = 0.62;
      for (const [prefix, share] of [
        ["FB", fbShare],
        ["IG", 1 - fbShare],
      ] as const) {
        rows.push(
          buildRow({
            date,
            platform,
            prefix,
            ticket,
            spend: series.spend[day] * share,
            cpm: series.cpm[day],
            ctr: series.ctr[day],
            frequency,
            videoViewRate,
            dailyBudgetCap: dailyBudgetCap * share,
          })
        );
      }
    } else {
      rows.push(
        buildRow({
          date,
          platform,
          prefix: prefixes[0],
          ticket,
          spend: series.spend[day],
          cpm: series.cpm[day],
          ctr: series.ctr[day],
          frequency,
          videoViewRate,
          dailyBudgetCap,
        })
      );
    }
  }

  return rows;
}

/**
 * Generates the full mock "Google Sheet" dataset: every live ticket (flight already started as
 * of MOCK_TODAY), across every platform on its ticket, 45-60 days of daily rows, with the seeded
 * anomaly/fatigue scenarios above baked in. New/pre-launch tickets (flight starts in the future)
 * produce no rows, which is exactly what makes them resolve to "new" status.
 */
export function generateMockPerformanceData(): PerformanceRow[] {
  const rows: PerformanceRow[] = [];
  for (const ticket of TICKETS_DATA) {
    const flightStart = parseDate(ticket.flightStartDate);
    if (daysBetween(flightStart, MOCK_TODAY) <= 0) continue; // not live yet

    for (const platform of ticket.platforms) {
      rows.push(...generateForCampaignPlatform(ticket, platform));
    }
  }
  return rows;
}
