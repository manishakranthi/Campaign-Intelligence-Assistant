/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are cast to each card's own shape by tool name, same convention as ToolResultCard */
import { formatCurrency, formatNumber, formatPercent, StatTile } from "@/components/cards/primitives";
import { PerformanceCard } from "@/components/cards/PerformanceCard";
import { TrendAnalysisCard } from "@/components/cards/TrendAnalysisCard";
import { ComparativeAnalysisCard } from "@/components/cards/ComparativeAnalysisCard";
import { AnomaliesCard } from "@/components/cards/AnomaliesCard";
import { CreativeFatigueCard } from "@/components/cards/CreativeFatigueCard";
import { PacingCard } from "@/components/cards/PacingCard";
import { BudgetReallocationCard } from "@/components/cards/BudgetCard";
import { AudienceExpansionCard } from "@/components/cards/AudienceExpansionCard";
import type { ToolResult } from "@/components/cards/ToolResultCard";

export const ANALYSIS_TOOL_NAMES = [
  "get_campaign_performance",
  "get_trend_analysis",
  "get_comparative_analysis",
  "detect_anomalies",
  "detect_creative_fatigue",
  "get_pacing_status",
  "recommend_budget_reallocation",
  "suggest_audience_expansion",
] as const;

export function CampaignDashboard({ campaignId, results }: { campaignId: string; results: ToolResult[] }) {
  const byName = new Map(results.map((r) => [r.name, r.result as any]));
  const performance = byName.get("get_campaign_performance");
  const trend = byName.get("get_trend_analysis");
  const comparative = byName.get("get_comparative_analysis");
  const anomalies = byName.get("detect_anomalies");
  const fatigue = byName.get("detect_creative_fatigue");
  const pacing = byName.get("get_pacing_status");
  const reallocation = byName.get("recommend_budget_reallocation");
  const expansion = byName.get("suggest_audience_expansion");

  return (
    <div className="flex w-full max-w-4xl flex-col gap-3">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Campaign #{campaignId} -- Analysis Dashboard
      </div>

      {performance && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            <StatTile label="Spend" value={formatCurrency(performance.combined.spend)} />
            <StatTile label="Impressions" value={formatNumber(performance.combined.impressions)} />
            <StatTile label="Clicks" value={formatNumber(performance.combined.clicks)} />
            <StatTile label="CTR" value={formatPercent(performance.combined.ctr, 2)} />
            <StatTile label="CPM" value={formatCurrency(performance.combined.cpm)} />
            <StatTile
              label="Frequency"
              value={performance.combined.avgFrequency !== null ? performance.combined.avgFrequency.toFixed(2) : "--"}
            />
          </div>
          <PerformanceCard performance={performance} />
        </>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {trend && <TrendAnalysisCard trend={trend} />}
        {comparative && <ComparativeAnalysisCard comparison={comparative} />}
        {pacing && <PacingCard pacing={pacing} />}
        {reallocation && <BudgetReallocationCard reallocation={reallocation} />}
      </div>

      {anomalies && <AnomaliesCard anomalies={anomalies} />}
      {fatigue && <CreativeFatigueCard fatigue={fatigue} />}
      {expansion && <AudienceExpansionCard expansion={expansion} />}
    </div>
  );
}
