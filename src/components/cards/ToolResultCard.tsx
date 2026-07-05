/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are cast to each card's own shape by tool name */
import { Card } from "./primitives";
import { TicketsCard } from "./TicketsCard";
import { PerformanceCard } from "./PerformanceCard";
import { TrendAnalysisCard } from "./TrendAnalysisCard";
import { ComparativeAnalysisCard } from "./ComparativeAnalysisCard";
import { AnomaliesCard } from "./AnomaliesCard";
import { CreativeFatigueCard } from "./CreativeFatigueCard";
import { PacingCard } from "./PacingCard";
import { BudgetReallocationCard, BudgetSplitCard } from "./BudgetCard";
import { TrendingAudienceCard } from "./TrendingAudienceCard";
import { AudienceExpansionCard } from "./AudienceExpansionCard";

export interface ToolResult {
  name: string;
  args: unknown;
  result: unknown;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="max-w-md border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
    </Card>
  );
}

function isErrorResult(result: unknown): result is { error: string } {
  return typeof result === "object" && result !== null && "error" in result && typeof (result as { error: unknown }).error === "string";
}

export function ToolResultCard({ toolResult }: { toolResult: ToolResult }) {
  const { name, result } = toolResult;

  if (isErrorResult(result)) {
    return <ErrorCard message={result.error} />;
  }
  if (result === null || result === undefined) {
    return null;
  }

  switch (name) {
    case "list_tickets":
      return <TicketsCard tickets={result as any} />;
    case "get_campaign_performance":
      return <PerformanceCard performance={result as any} />;
    case "get_trend_analysis":
      return <TrendAnalysisCard trend={result as any} />;
    case "get_comparative_analysis":
      return <ComparativeAnalysisCard comparison={result as any} />;
    case "detect_anomalies":
      return <AnomaliesCard anomalies={result as any} />;
    case "detect_creative_fatigue":
      return <CreativeFatigueCard fatigue={result as any} />;
    case "get_pacing_status":
      return <PacingCard pacing={result as any} />;
    case "recommend_initial_budget_split":
      return <BudgetSplitCard split={result as any} />;
    case "recommend_budget_reallocation":
      return <BudgetReallocationCard reallocation={result as any} />;
    case "get_trending_audience":
      return <TrendingAudienceCard audience={result as any} />;
    case "suggest_audience_expansion":
      return <AudienceExpansionCard expansion={result as any} />;
    default:
      return null;
  }
}
