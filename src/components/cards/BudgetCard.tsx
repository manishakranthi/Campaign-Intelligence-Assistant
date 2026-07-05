import { Card, CardTitle, formatCurrency, formatPercent, PlatformBadge } from "./primitives";

interface InitialBudgetAllocation {
  platform: string;
  share: number;
  amount: number;
}

interface InitialBudgetSplitResult {
  campaignId: string;
  overallBudget: number;
  allocations: InitialBudgetAllocation[];
  rationale: string;
  caveat: string;
}

export function BudgetSplitCard({ split }: { split: InitialBudgetSplitResult }) {
  return (
    <Card className="max-w-2xl">
      <div className="mb-2 flex items-center gap-2">
        <CardTitle>Campaign #{split.campaignId} -- Initial Budget Split</CardTitle>
        <span className="mb-3 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800 dark:bg-sky-950 dark:text-sky-300">
          Pre-launch estimate
        </span>
      </div>
      <div className="mb-3 flex flex-col gap-1.5">
        {split.allocations.map((a) => (
          <div key={a.platform} className="flex items-center gap-3">
            <div className="w-24 shrink-0">
              <PlatformBadge platform={a.platform} />
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${a.share * 100}%` }} />
            </div>
            <div className="w-28 shrink-0 text-right text-sm text-zinc-700 dark:text-zinc-300">
              {formatCurrency(a.amount)} ({formatPercent(a.share * 100, 0)})
            </div>
          </div>
        ))}
      </div>
      <p className="mb-1.5 text-xs text-zinc-600 dark:text-zinc-400">{split.rationale}</p>
      <p className="text-xs italic text-zinc-500 dark:text-zinc-500">{split.caveat}</p>
    </Card>
  );
}

interface PlatformEfficiencyRanking {
  platform: string;
  efficiencyValue: number;
  dailySpend: number;
}

interface BudgetReallocationResult {
  campaignId: string;
  efficiencyLabel: string;
  ranked: PlatformEfficiencyRanking[];
  applicable: boolean;
  strongestPlatform: string | null;
  weakestPlatform: string | null;
  shiftAmount: number;
  recommendation: string;
}

export function BudgetReallocationCard({ reallocation }: { reallocation: BudgetReallocationResult }) {
  return (
    <Card className="max-w-2xl">
      <CardTitle>Campaign #{reallocation.campaignId} -- Budget Reallocation</CardTitle>
      <div className="mb-3 flex flex-col gap-1">
        {reallocation.ranked.map((r, i) => (
          <div key={r.platform} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-1.5 text-sm dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">#{i + 1}</span>
              <PlatformBadge platform={r.platform} />
            </div>
            <span className="text-zinc-700 dark:text-zinc-300">
              {reallocation.efficiencyLabel}: {r.efficiencyValue.toFixed(2)} &middot; {formatCurrency(r.dailySpend)}/day
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-zinc-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-zinc-200">
        {reallocation.recommendation}
      </div>
    </Card>
  );
}
