import { getCampaignPerformance } from "./campaign-service";
import { PlatformKey } from "./platforms";
import { getTicketingSource } from "./ticketing-source";

type WeightProfile = Partial<Record<PlatformKey, number>>;

// Simple heuristic weights: platforms historically stronger for awareness (lower CPM, broad
// reach) vs. for click/traffic-driven objectives (stronger intent signals, better CTR).
const AWARENESS_WEIGHTS: WeightProfile = { META: 1.3, GOOGLE: 1.2, STACKADAPT: 1.0, TABOOLA: 0.9, LINKEDIN: 0.5 };
const TRAFFIC_WEIGHTS: WeightProfile = { GOOGLE: 1.4, META: 1.1, LINKEDIN: 0.9, TABOOLA: 0.9, STACKADAPT: 0.7 };
const BALANCED_WEIGHTS: WeightProfile = { META: 1, GOOGLE: 1, LINKEDIN: 1, TABOOLA: 1, STACKADAPT: 1 };
const DEFAULT_WEIGHT = 1;

function pickWeightProfile(
  goalTypeCode: string,
  objective: string
): { profile: WeightProfile; rationale: string } {
  const normalized = `${goalTypeCode} ${objective}`.toLowerCase();

  if (goalTypeCode === "AWR" || normalized.includes("awareness")) {
    return {
      profile: AWARENESS_WEIGHTS,
      rationale:
        "Brand awareness objective -- weighted toward platforms with historically lower CPMs and " +
        "strong reach (Meta, Google, StackAdapt), tempered on LinkedIn given its higher CPMs for pure reach plays.",
    };
  }
  if (goalTypeCode === "PV" || normalized.includes("page view") || normalized.includes("traffic")) {
    return {
      profile: TRAFFIC_WEIGHTS,
      rationale:
        "Page views / site traffic objective -- weighted toward platforms with historically stronger " +
        "click-through and intent signals (Google, Meta), with LinkedIn and Taboola in support and StackAdapt lightest.",
    };
  }
  return {
    profile: BALANCED_WEIGHTS,
    rationale: `Objective "${objective}" doesn't map to a known benchmark profile -- starting from an even split across platforms.`,
  };
}

export interface InitialBudgetAllocation {
  platform: PlatformKey;
  share: number;
  amount: number;
}

export interface InitialBudgetSplitResult {
  campaignId: string;
  overallBudget: number;
  objective: string;
  goalTypeCode: string;
  allocations: InitialBudgetAllocation[];
  rationale: string;
  isPreLaunchEstimate: true;
  caveat: string;
}

/**
 * Cold-start budget recommendation for a not-yet-live ticket: no performance history exists,
 * so the split is based on the campaign's objective/goal type and platform benchmarks only --
 * never this campaign's own data. Live campaigns should use recommend_budget_reallocation instead.
 */
export async function recommendInitialBudgetSplit(campaignId: string): Promise<InitialBudgetSplitResult | null> {
  const ticket = await getTicketingSource().getTicket(campaignId);
  if (!ticket) return null;

  const { profile, rationale } = pickWeightProfile(ticket.goalTypeCode, ticket.objective);
  const rawWeights = ticket.platforms.map((p) => profile[p] ?? DEFAULT_WEIGHT);
  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);

  const allocations: InitialBudgetAllocation[] = ticket.platforms.map((platform, i) => {
    const share = rawWeights[i] / totalWeight;
    return {
      platform,
      share: Number(share.toFixed(4)),
      amount: Number((ticket.overallBudget * share).toFixed(2)),
    };
  });

  return {
    campaignId,
    overallBudget: ticket.overallBudget,
    objective: ticket.objective,
    goalTypeCode: ticket.goalTypeCode,
    allocations,
    rationale,
    isPreLaunchEstimate: true,
    caveat:
      "This is a pre-launch starting point based on the campaign's objective and typical platform " +
      "benchmarks -- not this campaign's own performance, since none exists yet. Revisit with " +
      "recommend_budget_reallocation once live data comes in.",
  };
}

type EfficiencyMetric = "cpm" | "cpc" | "cost_per_video_view";

function efficiencyMetricForGoalType(goalTypeCode: string): { metric: EfficiencyMetric; label: string } {
  if (goalTypeCode === "PV") return { metric: "cpc", label: "cost-per-click (page-view proxy)" };
  if (goalTypeCode === "AWR") return { metric: "cpm", label: "CPM" };
  return { metric: "cost_per_video_view", label: "cost-per-video-view" };
}

const REALLOCATION_SHIFT_PCT = 0.15; // bounded 15-20% per the spec; never zero out a platform

export interface PlatformEfficiencyRanking {
  platform: PlatformKey;
  efficiencyValue: number;
  spend: number;
  dailySpend: number;
}

export interface BudgetReallocationResult {
  campaignId: string;
  goalTypeCode: string;
  efficiencyMetric: EfficiencyMetric;
  efficiencyLabel: string;
  ranked: PlatformEfficiencyRanking[];
  applicable: boolean;
  strongestPlatform: PlatformKey | null;
  weakestPlatform: PlatformKey | null;
  shiftPercent: number;
  shiftAmount: number;
  recommendation: string;
}

/**
 * Live campaigns only: ranks the campaign's platforms by the efficiency metric appropriate to
 * its goal type (CPM for impression goals, cost-per-click for page-view/click goals,
 * cost-per-video-view for video-view goals), then recommends shifting a bounded 15-20% of the
 * weakest platform's daily spend to the strongest -- never zeroing a platform out entirely.
 */
export async function recommendBudgetReallocation(campaignId: string): Promise<BudgetReallocationResult | null> {
  const [performance, ticket] = await Promise.all([
    getCampaignPerformance(campaignId),
    getTicketingSource().getTicket(campaignId),
  ]);
  if (!performance || !ticket) return null;

  const { metric, label } = efficiencyMetricForGoalType(ticket.goalTypeCode);

  const ranked: PlatformEfficiencyRanking[] = performance.platforms.map((p) => {
    const efficiencyValue =
      metric === "cpm"
        ? p.cpm
        : metric === "cpc"
          ? p.clicks > 0
            ? p.spend / p.clicks
            : Infinity
          : p.videoMetricTotal > 0
            ? p.spend / p.videoMetricTotal
            : Infinity;
    return {
      platform: p.platform,
      efficiencyValue: Number(efficiencyValue.toFixed(4)),
      spend: p.spend,
      dailySpend: Number((p.spend / Math.max(p.days, 1)).toFixed(2)),
    };
  });
  ranked.sort((a, b) => a.efficiencyValue - b.efficiencyValue); // lower cost-per-outcome is stronger

  if (ranked.length < 2) {
    return {
      campaignId,
      goalTypeCode: ticket.goalTypeCode,
      efficiencyMetric: metric,
      efficiencyLabel: label,
      ranked,
      applicable: false,
      strongestPlatform: ranked[0]?.platform ?? null,
      weakestPlatform: null,
      shiftPercent: 0,
      shiftAmount: 0,
      recommendation: "This campaign runs on a single platform -- there's nothing to reallocate between.",
    };
  }

  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const shiftAmount = Number((weakest.dailySpend * REALLOCATION_SHIFT_PCT).toFixed(2));

  return {
    campaignId,
    goalTypeCode: ticket.goalTypeCode,
    efficiencyMetric: metric,
    efficiencyLabel: label,
    ranked,
    applicable: true,
    strongestPlatform: strongest.platform,
    weakestPlatform: weakest.platform,
    shiftPercent: REALLOCATION_SHIFT_PCT * 100,
    shiftAmount,
    recommendation:
      `${weakest.platform} is the weakest platform on ${label} (${weakest.efficiencyValue.toFixed(2)} vs. ` +
      `${strongest.platform}'s ${strongest.efficiencyValue.toFixed(2)}). Shift about $${shiftAmount.toFixed(0)}/day ` +
      `(${(REALLOCATION_SHIFT_PCT * 100).toFixed(0)}% of ${weakest.platform}'s current ~$${weakest.dailySpend.toFixed(0)}/day) ` +
      `from ${weakest.platform} to ${strongest.platform}, rather than cutting ${weakest.platform} entirely -- ` +
      `keep it running to preserve reach/frequency management there.`,
  };
}
