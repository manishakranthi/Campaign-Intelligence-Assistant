/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are cast to each card's own shape by tool name, same convention as ToolResultCard */
import { Card, CardHeading, formatCurrency, formatNumber, formatPercent, PanelSection, PanelSectionList, StatTile } from "@/components/cards/primitives";
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

  const hasComparative =
    comparative && (comparative.peerComparisons.length > 0 || comparative.crossPlatformComparisons.length > 0);
  const hasOverviewPanel = trend || hasComparative || pacing || reallocation;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8 1l1.2 3.8L13 6l-3.8 1.2L8 11l-1.2-3.8L3 6l3.8-1.2L8 1z" />
          </svg>
        </span>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Analysis Dashboard
        </h2>
        <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          #{campaignId}
        </span>
      </div>

      {performance && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
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

      {hasOverviewPanel && (
        <Card className="max-w-4xl overflow-x-auto">
          <CardHeading campaignId={campaignId} title="Trend, Comparative & Budget" />
          <PanelSectionList>
            {trend && (
              <PanelSection title="Trend Comparison">
                <TrendAnalysisCard trend={trend} bare />
              </PanelSection>
            )}
            {hasComparative && (
              <PanelSection title={<>Comparative (&ldquo;Moat&rdquo;) Analysis</>}>
                <ComparativeAnalysisCard comparison={comparative} bare />
              </PanelSection>
            )}
            {pacing && (
              <PanelSection title="Pacing">
                <PacingCard pacing={pacing} bare />
              </PanelSection>
            )}
            {reallocation && (
              <PanelSection title="Budget Reallocation">
                <BudgetReallocationCard reallocation={reallocation} bare />
              </PanelSection>
            )}
          </PanelSectionList>
        </Card>
      )}

      {anomalies && <AnomaliesCard anomalies={anomalies} />}
      {fatigue && <CreativeFatigueCard fatigue={fatigue} />}
      {expansion && <AudienceExpansionCard expansion={expansion} />}
    </div>
  );
}
