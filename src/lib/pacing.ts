import { getCampaignPerformance } from "./campaign-service";
import { daysBetween, MOCK_TODAY, parseDate } from "./mock-data/mock-clock";
import { getTicketingSource } from "./ticketing-source";

export type PacingStatus = "on-pace" | "over-pacing" | "under-pacing";
export type GoalMetric = "impressions" | "clicks";

export interface PacingResult {
  campaignId: string;
  flightStartDate: string;
  flightEndDate: string;
  flightLengthDays: number;
  daysElapsed: number;
  daysRemaining: number;

  overallBudget: number;
  spendToDate: number;
  expectedSpendToDate: number;
  spendPacingStatus: PacingStatus;
  spendPacingDetail: string;

  goalMetric: GoalMetric;
  goalAmount: number;
  goalToDate: number;
  expectedGoalToDate: number;
  projectedGoalAtFlightEnd: number;
  goalPacingStatus: PacingStatus;
  goalPacingDetail: string;
}

const PACING_BAND = 0.1; // within +/-10% of expected pro-rated progress counts as "on-pace"

function classifyPacing(actual: number, expected: number): PacingStatus {
  if (expected <= 0) return "on-pace";
  if (actual > expected * (1 + PACING_BAND)) return "over-pacing";
  if (actual < expected * (1 - PACING_BAND)) return "under-pacing";
  return "on-pace";
}

/**
 * "Page views" is not a metric this sheet schema reports directly -- Clicks is the closest
 * available proxy for a page-view goal, so PV-type goals pace against Clicks. Awareness-type
 * goals pace against Impressions. Anything else falls back to Impressions defensively.
 */
function goalMetricForGoalType(goalTypeCode: string): GoalMetric {
  if (goalTypeCode === "PV") return "clicks";
  return "impressions";
}

export async function getPacingStatus(campaignId: string): Promise<PacingResult | null> {
  const [performance, ticket] = await Promise.all([
    getCampaignPerformance(campaignId),
    getTicketingSource().getTicket(campaignId),
  ]);
  if (!performance || !ticket) return null;

  const flightStart = parseDate(ticket.flightStartDate);
  const flightEnd = parseDate(ticket.flightEndDate);
  const flightLengthDays = daysBetween(flightStart, flightEnd) + 1;
  const daysElapsed = Math.min(Math.max(daysBetween(flightStart, MOCK_TODAY), 0), flightLengthDays);
  const daysRemaining = flightLengthDays - daysElapsed;
  const elapsedFraction = daysElapsed / flightLengthDays;

  const spendToDate = performance.combined.spend;
  const expectedSpendToDate = ticket.overallBudget * elapsedFraction;
  const spendPacingStatus = classifyPacing(spendToDate, expectedSpendToDate);

  let spendPacingDetail: string;
  if (spendPacingStatus === "over-pacing" && daysElapsed > 0) {
    const currentDailyRate = spendToDate / daysElapsed;
    const daysToExhaust = currentDailyRate > 0 ? ticket.overallBudget / currentDailyRate : Infinity;
    const daysEarly = Math.max(0, Math.round(flightLengthDays - daysToExhaust));
    spendPacingDetail =
      daysEarly > 0
        ? `At the current daily rate ($${currentDailyRate.toFixed(0)}/day), the budget will be exhausted ` +
          `about ${daysEarly} day(s) before the flight ends (${ticket.flightEndDate}).`
        : `Spend is running ahead of pro-rated pace ($${spendToDate.toFixed(0)} vs. an expected $${expectedSpendToDate.toFixed(0)} by now).`;
  } else if (spendPacingStatus === "under-pacing") {
    spendPacingDetail = `Spend is behind pro-rated pace: $${spendToDate.toFixed(0)} spent vs. an expected $${expectedSpendToDate.toFixed(0)} by now (${daysElapsed} of ${flightLengthDays} flight days elapsed).`;
  } else {
    spendPacingDetail = `Spend is on pace: $${spendToDate.toFixed(0)} vs. an expected $${expectedSpendToDate.toFixed(0)} by now.`;
  }

  const goalMetric = goalMetricForGoalType(ticket.goalTypeCode);
  const goalToDate = goalMetric === "clicks" ? performance.combined.clicks : performance.combined.impressions;
  const expectedGoalToDate = ticket.goalAmount * elapsedFraction;
  const projectedGoalAtFlightEnd = daysElapsed > 0 ? (goalToDate / daysElapsed) * flightLengthDays : 0;
  const goalPacingStatus = classifyPacing(goalToDate, expectedGoalToDate);

  const shortfallPct =
    ticket.goalAmount > 0 ? ((ticket.goalAmount - projectedGoalAtFlightEnd) / ticket.goalAmount) * 100 : 0;
  const metricLabel = goalMetric === "clicks" ? "page views (proxied by Clicks)" : "impressions";

  let goalPacingDetail: string;
  if (shortfallPct > 0) {
    goalPacingDetail =
      `Pacing to reach ${Math.round(projectedGoalAtFlightEnd).toLocaleString()} of your ${ticket.goalAmount.toLocaleString()} ` +
      `${metricLabel} goal by ${ticket.flightEndDate}, a ${shortfallPct.toFixed(0)}% shortfall at the current rate.`;
  } else {
    goalPacingDetail =
      `Pacing to reach ${Math.round(projectedGoalAtFlightEnd).toLocaleString()} of your ${ticket.goalAmount.toLocaleString()} ` +
      `${metricLabel} goal by ${ticket.flightEndDate}, ${Math.abs(shortfallPct).toFixed(0)}% ahead of goal at the current rate.`;
  }

  return {
    campaignId,
    flightStartDate: ticket.flightStartDate,
    flightEndDate: ticket.flightEndDate,
    flightLengthDays,
    daysElapsed,
    daysRemaining,
    overallBudget: ticket.overallBudget,
    spendToDate: Number(spendToDate.toFixed(2)),
    expectedSpendToDate: Number(expectedSpendToDate.toFixed(2)),
    spendPacingStatus,
    spendPacingDetail,
    goalMetric,
    goalAmount: ticket.goalAmount,
    goalToDate,
    expectedGoalToDate: Number(expectedGoalToDate.toFixed(0)),
    projectedGoalAtFlightEnd: Number(projectedGoalAtFlightEnd.toFixed(0)),
    goalPacingStatus,
    goalPacingDetail,
  };
}
