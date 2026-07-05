import { Card, CardTitle, formatCurrency, formatNumber, StatusBadge } from "./primitives";

interface PacingResult {
  campaignId: string;
  flightStartDate: string;
  flightEndDate: string;
  flightLengthDays: number;
  daysElapsed: number;
  daysRemaining: number;
  overallBudget: number;
  spendToDate: number;
  expectedSpendToDate: number;
  spendPacingStatus: "on-pace" | "over-pacing" | "under-pacing";
  spendPacingDetail: string;
  goalMetric: "impressions" | "clicks";
  goalAmount: number;
  goalToDate: number;
  expectedGoalToDate: number;
  goalPacingStatus: "on-pace" | "over-pacing" | "under-pacing";
  goalPacingDetail: string;
}

const BAR_FILL: Record<PacingResult["spendPacingStatus"], string> = {
  "on-pace": "bg-emerald-500",
  "over-pacing": "bg-amber-500",
  "under-pacing": "bg-red-500",
};

/** Filled bar shows actual progress; the marker tick shows where pro-rated pace expects it to be. */
function PacingBar({
  actual,
  total,
  expected,
  status,
}: {
  actual: number;
  total: number;
  expected: number;
  status: PacingResult["spendPacingStatus"];
}) {
  const actualPct = total > 0 ? Math.max(0, Math.min(100, (actual / total) * 100)) : 0;
  const expectedPct = total > 0 ? Math.max(0, Math.min(100, (expected / total) * 100)) : 0;

  return (
    <div className="relative h-2.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div className={`h-full rounded-full ${BAR_FILL[status]} transition-[width]`} style={{ width: `${actualPct}%` }} />
      <div
        className="absolute -top-0.5 h-[13px] w-0.5 rounded-full bg-zinc-500 dark:bg-zinc-300"
        style={{ left: `calc(${expectedPct}% - 1px)` }}
        title={`Expected progress at ${expectedPct.toFixed(0)}% of the flight`}
      />
    </div>
  );
}

export function PacingCard({ pacing }: { pacing: PacingResult }) {
  return (
    <Card className="max-w-2xl">
      <CardTitle>
        Campaign #{pacing.campaignId} -- Pacing ({pacing.daysElapsed}/{pacing.flightLengthDays} flight days elapsed)
      </CardTitle>
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Budget: {formatCurrency(pacing.spendToDate)} of {formatCurrency(pacing.overallBudget)} spent
            </span>
            <StatusBadge status={pacing.spendPacingStatus} />
          </div>
          <PacingBar
            actual={pacing.spendToDate}
            total={pacing.overallBudget}
            expected={pacing.expectedSpendToDate}
            status={pacing.spendPacingStatus}
          />
          <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{pacing.spendPacingDetail}</p>
        </div>
        <div className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Goal: {formatNumber(pacing.goalToDate)} of {formatNumber(pacing.goalAmount)} {pacing.goalMetric}
            </span>
            <StatusBadge status={pacing.goalPacingStatus} />
          </div>
          <PacingBar
            actual={pacing.goalToDate}
            total={pacing.goalAmount}
            expected={pacing.expectedGoalToDate}
            status={pacing.goalPacingStatus}
          />
          <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{pacing.goalPacingDetail}</p>
        </div>
      </div>
    </Card>
  );
}
